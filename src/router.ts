import type Database from "better-sqlite3";
import { callProvider, streamProvider } from "./adapters.js";
import { createRequest, finalizeRequest, getActiveCooldown, getProviderKey, recordAttempt, setCooldown } from "./db.js";
import { behaviorFor, clientStatusFor, safeExcerpt, SteadyRouteError } from "./errors.js";
import { PROVIDERS, resolveProviderEnvKey } from "./providers.js";
import { chatToResponsesResponse, promptTextFromChat, responsesToChat } from "./protocol.js";
import { unknownUsage } from "./usage.js";
import type { ChatRequestBody, ErrorClass, KeyMaterial, ProviderDefinition, ProviderModel, RouteCandidate, RouteHeaders } from "./types.js";

export interface RouteRequestInput {
  requestId: string;
  db: Database.Database;
  endpoint: "/v1/chat/completions" | "/v1/responses";
  method: string;
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
  traceFullBodies: boolean;
  providerOrder: string[];
}

export interface RouteRequestResult {
  response: Response;
  requestId: string;
  metadataDone?: Promise<void>;
}

export async function routeRequest(input: RouteRequestInput): Promise<RouteRequestResult> {
  const protocol = input.endpoint === "/v1/responses" ? "responses" : "chat_completions";
  const originalBody = input.body;
  const chatBody = protocol === "responses" ? responsesToChat(originalBody) : originalBody as ChatRequestBody;
  const stream = chatBody.stream === true;
  const routeHeaders = parseRouteHeaders(input.headers);
  const modelRequested = typeof chatBody.model === "string" ? chatBody.model : "steadyroute:auto";
  const client = detectClient(input.headers);
  const { candidates, skips } = buildCandidates({
    db: input.db,
    body: chatBody,
    modelRequested,
    routeHeaders,
    providerOrder: policyOrder(routeHeaders, input.providerOrder)
  });

  createRequest(input.db, {
    requestId: input.requestId,
    endpoint: input.endpoint,
    protocol,
    method: input.method,
    client,
    modelRequested,
    routePolicy: routeHeaders.routePolicy,
    providerAllowlist: routeHeaders.providerAllowlist,
    providerDenylist: routeHeaders.providerDenylist,
    requestBody: originalBody,
    catalogSource: "built-in providers + /Users/jax/Desktop/Apus/open-free-llm-catalog when available",
    candidates: candidates.map(candidateSummary),
    skips,
    traceFullBodies: input.traceFullBodies
  });

  if (candidates.length === 0) {
    const errorClass: ErrorClass = skips.some((skip) => String((skip as { reason?: unknown }).reason).includes("tool_unsupported")) ? "tool_unsupported" : "request_invalid";
    finalizeRequest(input.db, {
      requestId: input.requestId,
      finalStatus: "failed",
      httpStatus: clientStatusFor(errorClass),
      finalProvider: null,
      finalModel: null,
      finalErrorClass: errorClass,
      responseBody: { error: { message: "No route candidates available", code: errorClass, skips } },
      usage: unknownUsage(),
      streamMetadata: null,
      fallbackDecisions: skips
    });
    return { requestId: input.requestId, response: jsonError(input.requestId, errorClass, "No route candidates available", clientStatusFor(errorClass), skips) };
  }

  const fallbackDecisions: unknown[] = [];
  let lastError: SteadyRouteError | null = null;
  let attemptIndex = 0;

  for (const candidate of candidates) {
    attemptIndex += 1;
    const started = Date.now();
    const startedAt = new Date(started).toISOString();
    try {
      if (stream) {
        const streamResult = await streamProvider({ provider: candidate.provider, model: candidate.model, key: candidate.key, body: chatBody }, protocol === "responses" ? "responses" : "chat");
        const response = withSteadyHeaders(streamResult.response, input.requestId, candidate, 200, attemptIndex - 1);
        const metadataDone = streamResult.metadataPromise.then(({ metadata, bodyForLedger, usage }) => {
          const endedAt = new Date().toISOString();
          recordAttempt(input.db, {
            requestId: input.requestId,
            attemptIndex,
            provider: candidate.provider.id,
            model: candidate.model.id,
            keyAlias: candidate.key.alias,
            status: metadata.interrupted ? "failed" : "success",
            errorClass: metadata.interrupted ? "stream_interrupted" : null,
            behavior: metadata.interrupted ? behaviorFor("stream_interrupted") : null,
            upstreamStatus: 200,
            requestBody: chatBody,
            responseBody: bodyForLedger,
            responseHeaders: streamResult.headers,
            safeErrorExcerpt: "",
            startedAt,
            endedAt,
            latencyMs: Date.now() - started,
            usage,
            fallbackDecision: null
          });
          finalizeRequest(input.db, {
            requestId: input.requestId,
            finalStatus: metadata.interrupted ? "failed" : "success",
            httpStatus: metadata.interrupted ? 502 : 200,
            finalProvider: candidate.provider.id,
            finalModel: candidate.model.id,
            finalErrorClass: metadata.interrupted ? "stream_interrupted" : null,
            responseBody: bodyForLedger,
            usage,
            streamMetadata: metadata,
            fallbackDecisions
          });
        });
        return { requestId: input.requestId, response, metadataDone };
      }

      const result = await callProvider({ provider: candidate.provider, model: candidate.model, key: candidate.key, body: chatBody });
      const endedAt = new Date().toISOString();
      recordAttempt(input.db, {
        requestId: input.requestId,
        attemptIndex,
        provider: candidate.provider.id,
        model: candidate.model.id,
        keyAlias: candidate.key.alias,
        status: "success",
        errorClass: null,
        behavior: null,
        upstreamStatus: result.status,
        requestBody: chatBody,
        responseBody: result.body,
        responseHeaders: result.headers,
        safeErrorExcerpt: "",
        startedAt,
        endedAt,
        latencyMs: Date.now() - started,
        usage: result.usage,
        fallbackDecision: null
      });
      const rawBody = result.body && typeof result.body === "object" ? result.body as Record<string, unknown> : {};
      const responseBody = protocol === "responses" ? chatToResponsesResponse(rawBody, modelRequested) : rawBody;
      responseBody.steadyroute = { request_id: input.requestId, provider: candidate.provider.id, model: candidate.model.id, attempts: attemptIndex };
      finalizeRequest(input.db, {
        requestId: input.requestId,
        finalStatus: "success",
        httpStatus: 200,
        finalProvider: candidate.provider.id,
        finalModel: candidate.model.id,
        finalErrorClass: null,
        responseBody,
        usage: result.usage,
        streamMetadata: { stream: false, chunk_count: 0, first_chunk_at: null, final_chunk_at: null, done_seen: false, final_text: extractFinalText(responseBody), finish_reason: null, interrupted: false },
        fallbackDecisions
      });
      return {
        requestId: input.requestId,
        response: new Response(JSON.stringify(responseBody), {
          status: 200,
          headers: steadyHeaders(input.requestId, candidate, attemptIndex - 1, { "content-type": "application/json" })
        })
      };
    } catch (error) {
      const err = error instanceof SteadyRouteError ? error : new SteadyRouteError(error instanceof Error ? error.message : String(error), "unknown_provider_error");
      lastError = err;
      const behavior = behaviorFor(err.errorClass);
      const fallbackDecision = behavior.fallbackable ? "fallbackable: trying next candidate if available" : "not fallbackable: stopping";
      fallbackDecisions.push({ provider: candidate.provider.id, model: candidate.model.id, error_class: err.errorClass, decision: fallbackDecision });
      recordAttempt(input.db, {
        requestId: input.requestId,
        attemptIndex,
        provider: candidate.provider.id,
        model: candidate.model.id,
        keyAlias: candidate.key.alias,
        status: "failed",
        errorClass: err.errorClass,
        behavior,
        upstreamStatus: err.upstreamStatus,
        requestBody: chatBody,
        responseBody: { error: err.message, excerpt: err.safeExcerpt },
        responseHeaders: {},
        safeErrorExcerpt: err.safeExcerpt,
        startedAt,
        endedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        usage: unknownUsage(),
        fallbackDecision
      });
      if (behavior.cooldown) {
        setCooldown(input.db, candidate.provider.id, candidate.model.id, candidate.key.alias, err.errorClass, err.message, cooldownDuration(err.errorClass));
      }
      if (!behavior.fallbackable) break;
    }
  }

  const finalClass = lastError?.errorClass ?? "unknown_provider_error";
  const status = clientStatusFor(finalClass);
  const errorBody = {
    error: {
      message: lastError ? `${lastError.message}. See steadyroute request ${input.requestId}.` : `All route candidates failed. See steadyroute request ${input.requestId}.`,
      code: finalClass,
      type: "steadyroute_error"
    },
    steadyroute: { request_id: input.requestId, attempts: attemptIndex }
  };
  finalizeRequest(input.db, {
    requestId: input.requestId,
    finalStatus: "failed",
    httpStatus: status,
    finalProvider: null,
    finalModel: null,
    finalErrorClass: finalClass,
    responseBody: errorBody,
    usage: unknownUsage(),
    streamMetadata: null,
    fallbackDecisions
  });
  return { requestId: input.requestId, response: new Response(JSON.stringify(errorBody), { status, headers: { "content-type": "application/json", "x-steadyroute-request-id": input.requestId } }) };
}

function buildCandidates(args: { db: Database.Database; body: ChatRequestBody; modelRequested: string; routeHeaders: RouteHeaders; providerOrder: string[] }): { candidates: RouteCandidate[]; skips: unknown[] } {
  const candidates: RouteCandidate[] = [];
  const skips: unknown[] = [];
  const exact = parseExactModel(args.modelRequested);
  const ordered = orderProviders(args.providerOrder);
  const toolsPresent = Array.isArray(args.body.tools) ? args.body.tools.length > 0 : Boolean(args.body.tools);
  const stream = args.body.stream === true;

  for (const provider of ordered) {
    if (args.routeHeaders.providerAllowlist.length > 0 && !args.routeHeaders.providerAllowlist.includes(provider.id)) {
      skips.push({ provider: provider.id, model: "*", reason: "not in provider allowlist" });
      continue;
    }
    if (args.routeHeaders.providerDenylist.includes(provider.id)) {
      skips.push({ provider: provider.id, model: "*", reason: "provider denylisted" });
      continue;
    }
    const key = resolveKey(args.db, provider);
    if (!key.present) {
      skips.push({ provider: provider.id, model: "*", reason: provider.auth.humanAction ?? "missing provider key" });
      continue;
    }
    const models = exact && exact.provider === provider.id ? provider.models.filter((m) => m.id === exact.model) : exact && exact.provider && exact.provider !== provider.id ? [] : provider.models;
    if (models.length === 0 && exact?.provider === provider.id) {
      skips.push({ provider: provider.id, model: exact.model, reason: "exact model not found for provider" });
    }
    for (const model of models) {
      if (toolsPresent && model.capabilities.toolCalls === "unsupported") {
        skips.push({ provider: provider.id, model: model.id, reason: "tool_unsupported by catalog" });
        continue;
      }
      if (stream && model.capabilities.streaming === "unsupported") {
        skips.push({ provider: provider.id, model: model.id, reason: "streaming unsupported by catalog" });
        continue;
      }
      const cooldown = getActiveCooldown(args.db, provider.id, model.id, key.alias);
      if (cooldown) {
        skips.push({ provider: provider.id, model: model.id, reason: `cooldown until ${new Date(cooldown.until_ms).toISOString()} from ${cooldown.error_class}` });
        continue;
      }
      candidates.push({ provider, model, key, exact: Boolean(exact) });
    }
  }
  return { candidates, skips };
}

function resolveKey(db: Database.Database, provider: ProviderDefinition): KeyMaterial {
  const envKey = resolveProviderEnvKey(provider);
  if (envKey.present) return envKey;
  const stored = getProviderKey(db, provider.id, "default");
  if (stored) return { provider: provider.id, alias: "default", value: stored, source: "key_store", present: true };
  return envKey;
}

function parseRouteHeaders(headers: Record<string, string | string[] | undefined>): RouteHeaders {
  return {
    providerAllowlist: splitHeader(headers["x-steadyroute-provider-allowlist"]),
    providerDenylist: splitHeader(headers["x-steadyroute-provider-denylist"]),
    routePolicy: headerString(headers["x-steadyroute-route-policy"])
  };
}

function parseExactModel(modelRequested: string): { provider?: string; model: string } | null {
  if (!modelRequested || modelRequested === "auto" || modelRequested === "steadyroute:auto") return null;
  if (modelRequested.startsWith("steadyroute:")) {
    const value = modelRequested.slice("steadyroute:".length);
    const [provider, ...modelParts] = value.split("/");
    if (provider && modelParts.length > 0) return { provider, model: modelParts.join("/") };
    return null;
  }
  const [provider, ...modelParts] = modelRequested.split("/");
  if (provider && modelParts.length > 0 && PROVIDERS.some((p) => p.id === provider)) return { provider, model: modelParts.join("/") };
  return { model: modelRequested };
}

function orderProviders(order: string[]): ProviderDefinition[] {
  return [...PROVIDERS].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

function policyOrder(routeHeaders: RouteHeaders, defaultOrder: string[]): string[] {
  if (routeHeaders.routePolicy === "dogfood-invalid-key-then-fallback") {
    return ["openrouter", "github_models", "kilo", "groq", "gemini"];
  }
  return defaultOrder;
}

function candidateSummary(candidate: RouteCandidate): Record<string, unknown> {
  return {
    provider: candidate.provider.id,
    model: candidate.model.id,
    key_alias: candidate.key.alias,
    key_source: candidate.key.source,
    exact: candidate.exact,
    capabilities: candidate.model.capabilities
  };
}

function splitHeader(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value;
  return raw ? raw.split(",").map((part) => part.trim()).filter(Boolean) : [];
}

function headerString(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value.join(",") : value ?? null;
}

function detectClient(headers: Record<string, string | string[] | undefined>): string | null {
  const ua = headerString(headers["user-agent"])?.toLowerCase() ?? "";
  if (ua.includes("codex")) return "codex-cli";
  if (ua.includes("openai")) return "openai-sdk";
  if (ua.includes("curl")) return "curl";
  return ua || null;
}

function steadyHeaders(requestId: string, candidate: RouteCandidate, fallbackAttempts: number, extra: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    "x-steadyroute-request-id": requestId,
    "x-routed-via": `${candidate.provider.id}/${candidate.model.id}`,
    "x-fallback-attempts": String(fallbackAttempts)
  };
}

function withSteadyHeaders(response: Response, requestId: string, candidate: RouteCandidate, status: number, fallbackAttempts: number): Response {
  const headers = steadyHeaders(requestId, candidate, fallbackAttempts, {});
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return new Response(response.body, { status, headers });
}

function jsonError(requestId: string, errorClass: ErrorClass, message: string, status: number, details: unknown): Response {
  return new Response(JSON.stringify({ error: { message, code: errorClass }, steadyroute: { request_id: requestId, details } }), {
    status,
    headers: { "content-type": "application/json", "x-steadyroute-request-id": requestId }
  });
}

function cooldownDuration(errorClass: ErrorClass): number {
  switch (errorClass) {
    case "auth_failed":
    case "billing_required":
    case "model_removed":
      return 24 * 60 * 60 * 1000;
    case "quota_exhausted":
      return 30 * 60 * 1000;
    case "rate_limited":
      return 2 * 60 * 1000;
    default:
      return 30 * 1000;
  }
}

function extractFinalText(body: Record<string, unknown>): string {
  if (typeof body.output_text === "string") return body.output_text;
  const choices = Array.isArray(body.choices) ? body.choices as Array<Record<string, unknown>> : [];
  const message = choices[0]?.message && typeof choices[0]?.message === "object" ? choices[0].message as Record<string, unknown> : {};
  return typeof message.content === "string" ? message.content : "";
}

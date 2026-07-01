import { classifyProviderFailure, safeExcerpt, SteadyRouteError } from "./errors.js";
import { responseStreamEventFromChatChunk } from "./protocol.js";
import { estimateUsageFromText, unknownUsage, usageFromOpenAiBody } from "./usage.js";
import type { ChatRequestBody, KeyMaterial, ProviderAttemptResult, ProviderDefinition, ProviderModel, StreamMetadata } from "./types.js";

export interface AdapterInput {
  provider: ProviderDefinition;
  model: ProviderModel;
  key: KeyMaterial;
  body: ChatRequestBody;
  signal?: AbortSignal;
}

export interface StreamResult {
  response: Response;
  metadataPromise: Promise<{ metadata: StreamMetadata; bodyForLedger: Record<string, unknown>; usage: ReturnType<typeof unknownUsage> }>;
  headers: Record<string, string>;
}

export async function callProvider(input: AdapterInput): Promise<ProviderAttemptResult> {
  if (input.provider.apiShape === "gemini") return callGemini(input);
  return callOpenAiCompatible(input);
}

export async function streamProvider(input: AdapterInput, responseMode: "chat" | "responses"): Promise<StreamResult> {
  if (input.provider.apiShape === "gemini") return streamGemini(input, responseMode);
  return streamOpenAiCompatible(input, responseMode);
}

async function callOpenAiCompatible(input: AdapterInput): Promise<ProviderAttemptResult> {
  const upstreamBody = buildOpenAiBody(input.body, input.model.id, false);
  const response = await fetch(input.provider.baseUrl, {
    method: "POST",
    headers: buildHeaders(input.provider, input.key, false),
    body: JSON.stringify(upstreamBody),
    signal: input.signal
  }).catch((error) => {
    throw new SteadyRouteError(error instanceof Error ? error.message : "Network error", classifyProviderFailure(null, "", error), 502, null, safeExcerpt(String(error)));
  });
  const headers = headersToObject(response.headers);
  const text = await response.text();
  if (!response.ok) throw new SteadyRouteError(`Provider ${input.provider.id} failed with ${response.status}`, classifyProviderFailure(response.status, text), response.status, response.status, safeExcerpt(text));
  const body = parseJson(text);
  return {
    success: true,
    status: response.status,
    headers,
    body,
    text,
    usage: usageFromOpenAiBody(body, headers),
    upstreamModel: body && typeof body === "object" && typeof (body as { model?: unknown }).model === "string" ? (body as { model: string }).model : input.model.id
  };
}

async function streamOpenAiCompatible(input: AdapterInput, responseMode: "chat" | "responses"): Promise<StreamResult> {
  const upstreamBody = buildOpenAiBody(input.body, input.model.id, true);
  const upstream = await fetch(input.provider.baseUrl, {
    method: "POST",
    headers: buildHeaders(input.provider, input.key, true),
    body: JSON.stringify(upstreamBody),
    signal: input.signal
  }).catch((error) => {
    throw new SteadyRouteError(error instanceof Error ? error.message : "Network error", classifyProviderFailure(null, "", error), 502, null, safeExcerpt(String(error)));
  });
  const headers = headersToObject(upstream.headers);
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    throw new SteadyRouteError(`Provider ${input.provider.id} failed with ${upstream.status}`, classifyProviderFailure(upstream.status, text), upstream.status, upstream.status, safeExcerpt(text));
  }

  return wrapSseStream(upstream.body, headers, responseMode);
}

async function callGemini(input: AdapterInput): Promise<ProviderAttemptResult> {
  if (!input.key.value) {
    throw new SteadyRouteError("Missing Gemini API key", "auth_failed", 401);
  }
  const url = `${input.provider.baseUrl}/${encodeURIComponent(input.model.id)}:generateContent`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": input.key.value },
    body: JSON.stringify(toGeminiBody(input.body)),
    signal: input.signal
  }).catch((error) => {
    throw new SteadyRouteError(error instanceof Error ? error.message : "Network error", classifyProviderFailure(null, "", error), 502, null, safeExcerpt(String(error)));
  });
  const headers = headersToObject(response.headers);
  const text = await response.text();
  if (!response.ok) throw new SteadyRouteError(`Gemini failed with ${response.status}`, classifyProviderFailure(response.status, text), response.status, response.status, safeExcerpt(text));
  const gemini = parseJson(text);
  const output = extractGeminiText(gemini);
  const body = {
    id: `chatcmpl-gemini-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: input.model.id,
    choices: [{ index: 0, message: { role: "assistant", content: output }, finish_reason: extractGeminiFinish(gemini) }],
    usage: geminiUsage(gemini)
  };
  return {
    success: true,
    status: response.status,
    headers,
    body,
    text: JSON.stringify(body),
    usage: body.usage ? usageFromOpenAiBody(body, headers) : estimateUsageFromText(JSON.stringify(input.body.messages ?? []), output),
    upstreamModel: input.model.id
  };
}

async function streamGemini(input: AdapterInput, responseMode: "chat" | "responses"): Promise<StreamResult> {
  if (!input.key.value) {
    throw new SteadyRouteError("Missing Gemini API key", "auth_failed", 401);
  }
  const url = `${input.provider.baseUrl}/${encodeURIComponent(input.model.id)}:streamGenerateContent?alt=sse`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": input.key.value },
    body: JSON.stringify(toGeminiBody(input.body)),
    signal: input.signal
  }).catch((error) => {
    throw new SteadyRouteError(error instanceof Error ? error.message : "Network error", classifyProviderFailure(null, "", error), 502, null, safeExcerpt(String(error)));
  });
  const headers = headersToObject(upstream.headers);
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    throw new SteadyRouteError(`Gemini failed with ${upstream.status}`, classifyProviderFailure(upstream.status, text), upstream.status, upstream.status, safeExcerpt(text));
  }
  const transformed = upstream.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    }
  }));
  return wrapGeminiSseStream(transformed, input.model.id, headers, responseMode);
}

function wrapSseStream(body: ReadableStream<Uint8Array>, headers: Record<string, string>, responseMode: "chat" | "responses"): StreamResult {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const metadata: StreamMetadata = { stream: true, chunk_count: 0, first_chunk_at: null, final_chunk_at: null, done_seen: false, final_text: "", finish_reason: null, interrupted: false, error_class: null };
  let sequence = 0;
  let lastChunk: Record<string, unknown> | null = null;
  let sawOpenAiToolCalls = false;
  let resolveMetadata: (value: { metadata: StreamMetadata; bodyForLedger: Record<string, unknown>; usage: ReturnType<typeof unknownUsage> }) => void;
  const metadataPromise = new Promise<{ metadata: StreamMetadata; bodyForLedger: Record<string, unknown>; usage: ReturnType<typeof unknownUsage> }>((resolve) => {
    resolveMetadata = resolve;
  });
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const event of parts) {
            const dataLines = event.split(/\r?\n/).filter((line) => line.startsWith("data:"));
            for (const line of dataLines) {
              const data = line.replace(/^data:\s?/, "");
              if (data.trim() === "[DONE]") {
                metadata.done_seen = true;
                if (responseMode === "chat") controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                continue;
              }
              const parsed = parseJson(data);
              if (!parsed || typeof parsed !== "object") continue;
              lastChunk = parsed as Record<string, unknown>;
              const text = extractOpenAiDeltaText(lastChunk);
              if (hasOpenAiToolCalls(lastChunk)) sawOpenAiToolCalls = true;
              if (text) metadata.final_text += text;
              metadata.finish_reason = extractFinishReason(lastChunk) ?? metadata.finish_reason;
              metadata.chunk_count += 1;
              const now = new Date().toISOString();
              metadata.first_chunk_at ??= now;
              metadata.final_chunk_at = now;
              if (responseMode === "responses") {
                for (const responseEvent of responseStreamEventFromChatChunk(lastChunk, sequence++)) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(responseEvent)}\n\n`));
                }
              } else {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(lastChunk)}\n\n`));
              }
            }
          }
        }
        if (!metadata.done_seen && responseMode === "responses") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}\n\n`));
        }
        if (responseMode === "chat" && !metadata.done_seen) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        metadata.done_seen = true;
        if (metadata.finish_reason === "tool_calls" && !sawOpenAiToolCalls) {
          metadata.interrupted = true;
          metadata.error_class = "tool_unsupported";
        }
        controller.close();
      } catch (error) {
        metadata.interrupted = true;
        controller.error(error);
      } finally {
        reader.releaseLock();
        resolveMetadata({
          metadata,
          bodyForLedger: { stream: true, final_text: metadata.final_text, last_chunk: lastChunk },
          usage: metadata.final_text ? estimateUsageFromText("", metadata.final_text) : unknownUsage()
        });
      }
    }
  });
  return {
    response: new Response(out, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } }),
    headers,
    metadataPromise
  };
}

function wrapGeminiSseStream(body: ReadableStream<Uint8Array>, model: string, headers: Record<string, string>, responseMode: "chat" | "responses"): StreamResult {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const metadata: StreamMetadata = { stream: true, chunk_count: 0, first_chunk_at: null, final_chunk_at: null, done_seen: false, final_text: "", finish_reason: null, interrupted: false, error_class: null };
  let sequence = 0;
  let resolveMetadata: (value: { metadata: StreamMetadata; bodyForLedger: Record<string, unknown>; usage: ReturnType<typeof unknownUsage> }) => void;
  const metadataPromise = new Promise<{ metadata: StreamMetadata; bodyForLedger: Record<string, unknown>; usage: ReturnType<typeof unknownUsage> }>((resolve) => {
    resolveMetadata = resolve;
  });
  const out = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      let buffer = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const event of parts) {
            const data = event.split(/\r?\n/).find((line) => line.startsWith("data:"))?.replace(/^data:\s?/, "");
            if (!data) continue;
            const parsed = parseJson(data);
            const text = extractGeminiText(parsed);
            if (!text) continue;
            metadata.final_text += text;
            metadata.chunk_count += 1;
            const now = new Date().toISOString();
            metadata.first_chunk_at ??= now;
            metadata.final_chunk_at = now;
            const chunk = {
              id: `chatcmpl-gemini-${Date.now()}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [{ index: 0, delta: { role: "assistant", content: text }, finish_reason: null }]
            };
            if (responseMode === "responses") {
              for (const responseEvent of responseStreamEventFromChatChunk(chunk, sequence++)) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(responseEvent)}\n\n`));
              }
            } else {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
            }
          }
        }
        metadata.done_seen = true;
        metadata.finish_reason = metadata.finish_reason ?? "stop";
        if (responseMode === "chat") controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        else controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "response.completed", response: { status: "completed" } })}\n\n`));
        controller.close();
      } catch (error) {
        metadata.interrupted = true;
        controller.error(error);
      } finally {
        reader.releaseLock();
        resolveMetadata({
          metadata,
          bodyForLedger: { stream: true, final_text: metadata.final_text },
          usage: metadata.final_text ? estimateUsageFromText("", metadata.final_text) : unknownUsage()
        });
      }
    }
  });
  return {
    response: new Response(out, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" } }),
    headers,
    metadataPromise
  };
}

function buildOpenAiBody(body: ChatRequestBody, model: string, stream: boolean): Record<string, unknown> {
  const allowed = new Set(["messages", "temperature", "top_p", "stop", "max_tokens", "max_completion_tokens", "tools", "tool_choice", "response_format", "parallel_tool_calls"]);
  const out: Record<string, unknown> = { model, stream };
  for (const [key, value] of Object.entries(body)) {
    if (allowed.has(key) && value !== undefined) out[key] = value;
  }
  if (!out.messages) out.messages = body.messages ?? [{ role: "user", content: "" }];
  return out;
}

function buildHeaders(provider: ProviderDefinition, key: KeyMaterial, stream: boolean): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: stream ? "text/event-stream" : "application/json", ...(provider.defaultHeaders ?? {}) };
  if (provider.auth.method === "anonymous") headers.authorization = "Bearer anonymous";
  else if (key.value) headers.authorization = `Bearer ${key.value}`;
  return headers;
}

function toGeminiBody(body: ChatRequestBody): Record<string, unknown> {
  const contents = (body.messages ?? []).filter((message) => message.role !== "system").map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: contentToText(message.content) }]
  }));
  const system = (body.messages ?? []).filter((message) => message.role === "system").map((message) => contentToText(message.content)).join("\n");
  const out: Record<string, unknown> = {
    contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: "" }] }],
    generationConfig: {
      temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      maxOutputTokens: typeof body.max_tokens === "number" ? body.max_tokens : typeof body.max_completion_tokens === "number" ? body.max_completion_tokens : undefined
    }
  };
  if (system) out.systemInstruction = { parts: [{ text: system }] };
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    out.tools = [{ functionDeclarations: body.tools.map((tool) => openAiToolToGemini(tool)).filter(Boolean) }];
  }
  return out;
}

function openAiToolToGemini(tool: unknown): unknown {
  if (!tool || typeof tool !== "object") return null;
  const fn = (tool as Record<string, unknown>).function;
  if (!fn || typeof fn !== "object") return null;
  const f = fn as Record<string, unknown>;
  return {
    name: typeof f.name === "string" ? f.name.replace(/[^A-Za-z0-9_.-]/g, "_") : "tool",
    description: typeof f.description === "string" ? f.description : "",
    parameters: sanitizeGeminiSchema(f.parameters ?? { type: "object", properties: {} })
  };
}

function sanitizeGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const disallowed = new Set(["$schema", "$id", "$ref", "$defs", "$comment", "oneOf", "anyOf", "allOf", "not", "dependentRequired", "dependentSchemas", "unevaluatedProperties"]);
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (disallowed.has(key) || key.toLowerCase().startsWith("x-")) continue;
    out[key] = sanitizeGeminiSchema(value);
  }
  return out;
}

function contentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : part && typeof part === "object" && "text" in part ? String((part as { text: unknown }).text) : JSON.stringify(part)).join("\n");
  return content == null ? "" : JSON.stringify(content);
}

function extractOpenAiDeltaText(chunk: Record<string, unknown>): string {
  const choices = Array.isArray(chunk.choices) ? chunk.choices as Array<Record<string, unknown>> : [];
  const delta = choices[0]?.delta && typeof choices[0]?.delta === "object" ? choices[0]?.delta as Record<string, unknown> : {};
  return typeof delta.content === "string" ? delta.content : "";
}

function extractFinishReason(chunk: Record<string, unknown>): string | null {
  const choices = Array.isArray(chunk.choices) ? chunk.choices as Array<Record<string, unknown>> : [];
  const finish = choices[0]?.finish_reason;
  return typeof finish === "string" ? finish : null;
}

function hasOpenAiToolCalls(chunk: Record<string, unknown>): boolean {
  const choices = Array.isArray(chunk.choices) ? chunk.choices as Array<Record<string, unknown>> : [];
  const delta = choices[0]?.delta && typeof choices[0]?.delta === "object" ? choices[0]?.delta as Record<string, unknown> : {};
  return Array.isArray(delta.tool_calls) && delta.tool_calls.length > 0;
}

function extractGeminiText(body: unknown): string {
  const candidates = body && typeof body === "object" && Array.isArray((body as { candidates?: unknown }).candidates) ? (body as { candidates: Array<Record<string, unknown>> }).candidates : [];
  const parts = candidates[0]?.content && typeof candidates[0]?.content === "object" && Array.isArray((candidates[0].content as { parts?: unknown }).parts) ? (candidates[0].content as { parts: Array<Record<string, unknown>> }).parts : [];
  return parts.map((part) => typeof part.text === "string" ? part.text : "").join("");
}

function extractGeminiFinish(body: unknown): string | null {
  const candidates = body && typeof body === "object" && Array.isArray((body as { candidates?: unknown }).candidates) ? (body as { candidates: Array<Record<string, unknown>> }).candidates : [];
  const reason = candidates[0]?.finishReason;
  return typeof reason === "string" ? reason.toLowerCase() : null;
}

function geminiUsage(body: unknown): Record<string, number> | null {
  const meta = body && typeof body === "object" ? (body as { usageMetadata?: Record<string, unknown> }).usageMetadata : undefined;
  if (!meta) return null;
  return {
    prompt_tokens: typeof meta.promptTokenCount === "number" ? meta.promptTokenCount : 0,
    completion_tokens: typeof meta.candidatesTokenCount === "number" ? meta.candidatesTokenCount : 0,
    total_tokens: typeof meta.totalTokenCount === "number" ? meta.totalTokenCount : 0
  };
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

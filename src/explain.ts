import type Database from "better-sqlite3";
import { behaviorFor } from "./errors.js";
import { readRequestWithAttempts } from "./db.js";
import type { ErrorClass } from "./types.js";

export function explainRequest(db: Database.Database, requestId: string): string {
  const data = readRequestWithAttempts(db, requestId);
  if (!data) return `No SteadyRoute request found for ${requestId}`;

  const request = data.request;
  const lines: string[] = [];
  lines.push(`SteadyRoute request ${requestId}`);
  lines.push(`Trace: ${request.trace_id ?? "unknown"} span=${request.span_id ?? "unknown"}`);
  lines.push(`Status: ${request.final_status ?? "incomplete"} (HTTP ${request.http_status ?? "unknown"})`);
  lines.push(`Endpoint: ${request.endpoint}`);
  lines.push(`Protocol: ${request.protocol}`);
  lines.push(`Client: ${request.client ?? "unknown"}`);
  lines.push(`Requested model: ${request.model_requested ?? "unknown"}`);
  lines.push(`Route policy: ${request.route_policy ?? "auto"}`);
  lines.push(`Catalog source: ${request.catalog_source}`);
  lines.push(`Final provider/model: ${request.final_provider ?? "none"} / ${request.final_model ?? "none"}`);
  if (request.final_error_class) {
    const cls = request.final_error_class as ErrorClass;
    lines.push(`Final error class: ${cls} ${formatBehavior(cls)}`);
  }

  lines.push("");
  lines.push("Request shape:");
  const requestBody = parseJsonObject(request.request_body_json);
  const toolNames = extractToolNames(requestBody.tools);
  lines.push(`- stream: ${requestBody.stream === true}`);
  lines.push(`- tools_present: ${toolNames.length > 0}`);
  lines.push(`- structured_output: ${formatStructuredOutput(requestBody.response_format ?? responseFormatFromResponsesText(requestBody.text))}`);
  if (toolNames.length > 0) lines.push(`- tool_names: ${toolNames.join(", ")}`);
  const responseBody = parseJsonObject(request.response_body_json);
  const responseToolCalls = extractResponseToolCalls(responseBody);
  if (responseToolCalls.length > 0) lines.push(`- response_tool_calls: ${responseToolCalls.join(", ")}`);

  lines.push("");
  lines.push("Candidate summary:");
  for (const candidate of parseJsonArray(request.candidates_json)) {
    const c = candidate as Record<string, unknown>;
    const capabilities = c.capabilities && typeof c.capabilities === "object" ? c.capabilities as Record<string, unknown> : {};
    lines.push(`- ${c.provider}/${c.model} key=${c.key_alias ?? "unknown"} exact=${c.exact ? "yes" : "no"} tool_calls=${capabilities.toolCalls ?? "unknown"} json_mode=${capabilities.jsonMode ?? "unknown"}`);
  }
  const skips = parseJsonArray(request.skips_json);
  if (skips.length > 0) {
    lines.push("");
    lines.push("Skipped candidates:");
    for (const skip of skips) {
      const s = skip as Record<string, unknown>;
      lines.push(`- ${s.provider}/${s.model}: ${s.reason}`);
    }
  }

  lines.push("");
  lines.push("Attempts:");
  for (const attempt of data.attempts) {
    lines.push(`- #${attempt.attempt_index} ${attempt.provider}/${attempt.model} key=${attempt.key_alias} status=${attempt.status} upstream=${attempt.upstream_status ?? "n/a"} latency=${attempt.latency_ms}ms`);
    if (attempt.error_class) lines.push(`  error: ${attempt.error_class} ${formatBehavior(attempt.error_class as ErrorClass)}`);
    if (attempt.fallback_decision) lines.push(`  fallback: ${attempt.fallback_decision}`);
    if (attempt.safe_error_excerpt) lines.push(`  excerpt: ${attempt.safe_error_excerpt}`);
    const usage = parseJsonObject(attempt.usage_json);
    lines.push(`  usage: input=${formatUsage(usage.input_tokens)} output=${formatUsage(usage.output_tokens)} total=${formatUsage(usage.total_tokens)}`);
    const quota = usage.quota && typeof usage.quota === "object" ? usage.quota as Record<string, unknown> : {};
    const quotaEntries = Object.entries(quota).map(([key, value]) => `${key}=${formatUsage(value)}`);
    if (quotaEntries.length > 0) lines.push(`  quota: ${quotaEntries.join(", ")}`);
  }

  const stream = parseJsonObject(request.stream_metadata_json);
  if (Object.keys(stream).length > 0) {
    lines.push("");
    lines.push("Stream metadata:");
    lines.push(`- stream: ${stream.stream}`);
    lines.push(`- chunk_count: ${stream.chunk_count ?? 0}`);
    lines.push(`- first_chunk_at: ${stream.first_chunk_at ?? "unknown"}`);
    lines.push(`- final_chunk_at: ${stream.final_chunk_at ?? "unknown"}`);
    lines.push(`- done_seen: ${stream.done_seen ?? false}`);
    lines.push(`- finish_reason: ${stream.finish_reason ?? "unknown"}`);
    lines.push(`- final_text: ${stream.final_text ? JSON.stringify(String(stream.final_text).slice(0, 500)) : "unknown"}`);
  }

  lines.push("");
  lines.push("Trace body storage:");
  lines.push(`- full local request/response bodies stored: ${request.trace_full_bodies ? "yes" : "no"}`);
  return lines.join("\n");
}

function formatBehavior(cls: ErrorClass): string {
  const behavior = behaviorFor(cls);
  return `(retryable=${behavior.retryable}, fallbackable=${behavior.fallbackable}, cooldown=${behavior.cooldown}, user_actionable=${behavior.userActionable})`;
}

function parseJsonArray(value: unknown): unknown[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function formatUsage(value: unknown): string {
  if (!value || typeof value !== "object") return "unknown";
  const v = value as Record<string, unknown>;
  return `${v.value ?? "unknown"} (${v.source ?? "unknown"})`;
}

function extractToolNames(tools: unknown): string[] {
  if (!Array.isArray(tools)) return [];
  const names: string[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object") continue;
    const record = tool as Record<string, unknown>;
    const fn = record.function && typeof record.function === "object" ? record.function as Record<string, unknown> : null;
    const name = typeof fn?.name === "string" ? fn.name : typeof record.name === "string" ? record.name : null;
    if (name) names.push(name);
  }
  return names;
}

function formatStructuredOutput(responseFormat: unknown): string {
  if (!responseFormat || typeof responseFormat !== "object") return "none";
  const record = responseFormat as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "unknown";
  if (type !== "json_schema") return type;
  const schema = record.json_schema && typeof record.json_schema === "object" ? record.json_schema as Record<string, unknown> : {};
  const name = typeof schema.name === "string" ? schema.name : "unnamed";
  return `json_schema:${name}`;
}

function responseFormatFromResponsesText(text: unknown): unknown {
  if (!text || typeof text !== "object") return null;
  const format = (text as Record<string, unknown>).format;
  if (!format || typeof format !== "object") return null;
  const record = format as Record<string, unknown>;
  if (record.type === "json_schema") {
    return {
      type: "json_schema",
      json_schema: { name: typeof record.name === "string" ? record.name : "response" }
    };
  }
  if (record.type === "json_object") return { type: "json_object" };
  return null;
}

function extractResponseToolCalls(body: Record<string, unknown>): string[] {
  const names: string[] = [];
  const choices = Array.isArray(body.choices) ? body.choices as Array<Record<string, unknown>> : [];
  for (const choice of choices) {
    const message = choice.message && typeof choice.message === "object" ? choice.message as Record<string, unknown> : {};
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls as Array<Record<string, unknown>> : [];
    for (const call of calls) {
      const fn = call.function && typeof call.function === "object" ? call.function as Record<string, unknown> : {};
      if (typeof fn.name === "string") names.push(fn.name);
    }
  }
  const output = Array.isArray(body.output) ? body.output as Array<Record<string, unknown>> : [];
  for (const item of output) {
    if (item.type === "function_call" && typeof item.name === "string") names.push(item.name);
  }
  return names;
}

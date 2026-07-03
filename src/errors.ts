import type { ErrorBehavior, ErrorClass } from "./types.js";

export const ERROR_BEHAVIOR: Record<ErrorClass, ErrorBehavior> = {
  auth_failed: { retryable: false, fallbackable: true, cooldown: true, userActionable: true },
  billing_required: { retryable: false, fallbackable: true, cooldown: true, userActionable: true },
  quota_exhausted: { retryable: false, fallbackable: true, cooldown: true, userActionable: true },
  rate_limited: { retryable: true, fallbackable: true, cooldown: true, userActionable: false },
  provider_down: { retryable: true, fallbackable: true, cooldown: true, userActionable: false },
  model_removed: { retryable: false, fallbackable: true, cooldown: true, userActionable: true },
  context_too_large: { retryable: false, fallbackable: true, cooldown: false, userActionable: true },
  request_invalid: { retryable: false, fallbackable: false, cooldown: false, userActionable: true },
  schema_rejected: { retryable: false, fallbackable: false, cooldown: false, userActionable: true },
  tool_unsupported: { retryable: false, fallbackable: true, cooldown: false, userActionable: true },
  stream_interrupted: { retryable: true, fallbackable: true, cooldown: true, userActionable: false },
  network_error: { retryable: true, fallbackable: true, cooldown: true, userActionable: false },
  timeout: { retryable: true, fallbackable: true, cooldown: true, userActionable: false },
  unknown_provider_error: { retryable: true, fallbackable: true, cooldown: true, userActionable: false }
};

export class SteadyRouteError extends Error {
  readonly errorClass: ErrorClass;
  readonly status: number;
  readonly upstreamStatus: number | null;
  readonly safeExcerpt: string;

  constructor(message: string, errorClass: ErrorClass, status = 502, upstreamStatus: number | null = null, safeExcerpt = "") {
    super(message);
    this.name = "SteadyRouteError";
    this.errorClass = errorClass;
    this.status = status;
    this.upstreamStatus = upstreamStatus;
    this.safeExcerpt = safeExcerpt;
  }
}

export function behaviorFor(errorClass: ErrorClass): ErrorBehavior {
  return ERROR_BEHAVIOR[errorClass];
}

export function classifyProviderFailure(status: number | null, bodyText: string, cause?: unknown): ErrorClass {
  const text = bodyText.toLowerCase();
  const causeText = cause instanceof Error ? `${cause.name} ${cause.message}`.toLowerCase() : "";
  const combined = `${text} ${causeText}`;

  if (combined.includes("abort") || combined.includes("timeout") || combined.includes("timed out")) return "timeout";
  if (
    combined.includes("econn") ||
    combined.includes("socket") ||
    combined.includes("fetch failed") ||
    combined.includes("network") ||
    combined.includes("terminated") ||
    combined.includes("connection closed") ||
    combined.includes("other side closed") ||
    combined.includes("undici")
  ) return "network_error";

  if (status === 401 || combined.includes("invalid api key") || combined.includes("unauthorized") || combined.includes("user not found")) return "auth_failed";
  if (status === 402 || combined.includes("payment") || combined.includes("billing") || combined.includes("out of credits") || combined.includes("insufficient balance")) return "billing_required";
  if (status === 403 && (combined.includes("quota") || combined.includes("insufficient"))) return "quota_exhausted";
  if (status === 429) {
    if (combined.includes("quota") || combined.includes("free_tier") || combined.includes("resource_exhausted")) return "quota_exhausted";
    return "rate_limited";
  }
  if (status === 404 || status === 410 || combined.includes("model not found") || combined.includes("model_not_found") || combined.includes("does not exist")) return "model_removed";
  if (status === 413 || combined.includes("context length") || combined.includes("maximum context") || combined.includes("too many tokens")) return "context_too_large";
  if (status === 400 && (combined.includes("schema") || combined.includes("json schema") || combined.includes("tool"))) return "schema_rejected";
  if (status === 400 || status === 422) return "request_invalid";
  if (status !== null && status >= 500) return "provider_down";
  return "unknown_provider_error";
}

export function clientStatusFor(errorClass: ErrorClass): number {
  switch (errorClass) {
    case "auth_failed":
      return 401;
    case "billing_required":
      return 402;
    case "quota_exhausted":
    case "rate_limited":
      return 429;
    case "model_removed":
      return 404;
    case "context_too_large":
      return 413;
    case "request_invalid":
    case "schema_rejected":
    case "tool_unsupported":
      return 400;
    case "timeout":
      return 504;
    default:
      return 502;
  }
}

export function safeExcerpt(text: string, limit = 900): string {
  return redactSecrets(text).slice(0, limit);
}

export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-[REDACTED]")
    .replace(/sk-or-v1-[A-Za-z0-9_-]+/g, "sk-or-v1-[REDACTED]")
    .replace(/gsk_[A-Za-z0-9_-]+/g, "gsk_[REDACTED]")
    .replace(/gh[opsu]_[A-Za-z0-9_]+/g, "gh*_ [REDACTED]")
    .replace(/AIza[A-Za-z0-9_-]+/g, "AIza[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, "Bearer [REDACTED]");
}

import type { UsageEvidence } from "./types.js";

export function unknownUsage(): UsageEvidence {
  return {
    input_tokens: { value: null, source: "unknown" },
    output_tokens: { value: null, source: "unknown" },
    total_tokens: { value: null, source: "unknown" },
    quota: {
      daily_quota_remaining: { value: null, source: "unknown" },
      reset_at: { value: null, source: "unknown" }
    }
  };
}

export function usageFromOpenAiBody(body: unknown, headers: Record<string, string>): UsageEvidence {
  const usage = unknownUsage();
  const maybe = body && typeof body === "object" ? (body as { usage?: Record<string, unknown> }).usage : undefined;
  if (maybe) {
    usage.input_tokens = { value: numberOrNull(maybe.prompt_tokens), source: numberOrNull(maybe.prompt_tokens) === null ? "unknown" : "provider_reported" };
    usage.output_tokens = { value: numberOrNull(maybe.completion_tokens), source: numberOrNull(maybe.completion_tokens) === null ? "unknown" : "provider_reported" };
    usage.total_tokens = { value: numberOrNull(maybe.total_tokens), source: numberOrNull(maybe.total_tokens) === null ? "unknown" : "provider_reported" };
  }
  addHeaderQuota(usage, headers, "x-ratelimit-remaining-requests", "rate_limit_remaining_requests");
  addHeaderQuota(usage, headers, "x-ratelimit-remaining-tokens", "rate_limit_remaining_tokens");
  addHeaderQuota(usage, headers, "x-ratelimit-reset-requests", "rate_limit_reset_requests");
  addHeaderQuota(usage, headers, "x-ratelimit-reset-tokens", "rate_limit_reset_tokens");
  addHeaderQuota(usage, headers, "retry-after", "retry_after_seconds");
  return usage;
}

export function estimateUsageFromText(promptText: string, outputText: string): UsageEvidence {
  return {
    input_tokens: { value: Math.ceil(promptText.length / 4), source: "estimated" },
    output_tokens: { value: Math.ceil(outputText.length / 4), source: "estimated" },
    total_tokens: { value: Math.ceil((promptText.length + outputText.length) / 4), source: "estimated" },
    quota: {
      daily_quota_remaining: { value: null, source: "unknown" },
      reset_at: { value: null, source: "unknown" }
    }
  };
}

function addHeaderQuota(usage: UsageEvidence, headers: Record<string, string>, headerName: string, key: string): void {
  const value = headers[headerName];
  if (value !== undefined) {
    usage.quota[key] = { value, source: "provider_reported" };
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

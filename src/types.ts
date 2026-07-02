export type Protocol = "chat_completions" | "responses" | "diagnostic";

export type ErrorClass =
  | "auth_failed"
  | "billing_required"
  | "quota_exhausted"
  | "rate_limited"
  | "provider_down"
  | "model_removed"
  | "context_too_large"
  | "request_invalid"
  | "schema_rejected"
  | "tool_unsupported"
  | "stream_interrupted"
  | "network_error"
  | "timeout"
  | "unknown_provider_error";

export type EvidenceSource = "provider_reported" | "observed" | "estimated" | "unknown" | "stale";

export type CapabilityState = "known" | "estimated" | "unknown" | "community-reported" | "unsupported";
export type ProviderStatus = "verified" | "implemented-unverified" | "blocked-by-auth" | "catalog-only" | "broken" | "deprecated";

export interface ErrorBehavior {
  retryable: boolean;
  fallbackable: boolean;
  cooldown: boolean;
  userActionable: boolean;
}

export interface ProviderModel {
  id: string;
  label?: string;
  contextWindow: number | null;
  priority?: {
    auto?: number;
    coding?: number;
  };
  capabilities: {
    chat: CapabilityState;
    responses: CapabilityState;
    streaming: CapabilityState;
    toolCalls: CapabilityState;
    jsonMode: CapabilityState;
  };
  freeTier: {
    status: CapabilityState;
    notes: string;
  };
}

export interface ProviderDefinition {
  id: string;
  displayName: string;
  status: ProviderStatus;
  apiShape: "openai-compatible" | "gemini" | "unknown";
  baseUrl: string;
  auth: {
    method: "api_key" | "gh_token" | "anonymous" | "none";
    env: string[];
    required: boolean;
    humanAction: string | null;
  };
  defaultHeaders?: Record<string, string>;
  models: ProviderModel[];
  catalogSource: string;
  evidence: string[];
  notes: string[];
}

export interface KeyMaterial {
  provider: string;
  alias: string;
  value: string | null;
  source: "env" | "key_store" | "gh_cli" | "anonymous" | "none";
  present: boolean;
}

export interface RouteCandidate {
  provider: ProviderDefinition;
  model: ProviderModel;
  key: KeyMaterial;
  exact: boolean;
  skipped?: string;
}

export interface ChatRequestBody {
  model?: string;
  messages?: Array<Record<string, unknown>>;
  stream?: boolean;
  tools?: unknown;
  tool_choice?: unknown;
  max_tokens?: number;
  max_completion_tokens?: number;
  temperature?: number;
  response_format?: unknown;
  [key: string]: unknown;
}

export interface UsageEvidence {
  input_tokens: { value: number | null; source: EvidenceSource };
  output_tokens: { value: number | null; source: EvidenceSource };
  total_tokens: { value: number | null; source: EvidenceSource };
  quota: Record<string, { value: string | number | null; source: EvidenceSource }>;
}

export interface StreamMetadata {
  stream: boolean;
  chunk_count: number;
  first_chunk_at: string | null;
  final_chunk_at: string | null;
  done_seen: boolean;
  final_text: string;
  finish_reason: string | null;
  interrupted: boolean;
  error_class?: ErrorClass | null;
}

export interface ProviderAttemptResult {
  success: boolean;
  status: number;
  headers: Record<string, string>;
  body: unknown;
  text: string;
  usage: UsageEvidence;
  upstreamModel: string | null;
}

export interface RouteHeaders {
  providerAllowlist: string[];
  providerDenylist: string[];
  routePolicy: string | null;
}

import { execFileSync } from "node:child_process";
import type { KeyMaterial, ProviderDefinition, ProviderModel } from "./types.js";

function model(id: string, partial: Partial<ProviderModel> = {}): ProviderModel {
  return {
    id,
    label: partial.label,
    contextWindow: partial.contextWindow ?? 128000,
    capabilities: {
      chat: partial.capabilities?.chat ?? "known",
      responses: partial.capabilities?.responses ?? "estimated",
      streaming: partial.capabilities?.streaming ?? "known",
      toolCalls: partial.capabilities?.toolCalls ?? "unknown",
      jsonMode: partial.capabilities?.jsonMode ?? "unknown"
    },
    freeTier: partial.freeTier ?? {
      status: "unknown",
      notes: "Free-tier capacity is provider-controlled and may change without notice."
    }
  };
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "github_models",
    displayName: "GitHub Models",
    apiShape: "openai-compatible",
    baseUrl: "https://models.inference.ai.azure.com/chat/completions",
    auth: {
      method: "gh_token",
      env: ["GITHUB_MODELS_TOKEN", "GITHUB_TOKEN"],
      required: true,
      humanAction: "Log in with GitHub CLI or provide GITHUB_MODELS_TOKEN/GITHUB_TOKEN."
    },
    models: [
      model("gpt-4o-mini", {
        label: "OpenAI GPT-4o mini via GitHub Models",
        contextWindow: 128000,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "known" },
        freeTier: { status: "known", notes: "Available through authorized GitHub Models access; rate-limit headers are provider-reported." }
      })
    ],
    catalogSource: "live probe + GitHub Models OpenAI-compatible endpoint",
    notes: ["Uses local GitHub CLI token when no explicit environment token is present."]
  },
  {
    id: "kilo",
    displayName: "Kilo anonymous OpenRouter free route",
    apiShape: "openai-compatible",
    baseUrl: "https://api.kilo.ai/api/openrouter/chat/completions",
    auth: { method: "anonymous", env: [], required: false, humanAction: null },
    defaultHeaders: { "x-kilocode-editorname": "SteadyRoute" },
    models: [
      model("openrouter/free", {
        label: "Kilo anonymous free router",
        contextWindow: 200000,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "community-reported", jsonMode: "unknown" },
        freeTier: { status: "community-reported", notes: "Keyless path verified locally; upstream model and provider may vary per request." }
      })
    ],
    catalogSource: "OmniRoute Kilo registry + live anonymous probe",
    notes: ["Keyless best-effort provider used for validation and fallback; not one of the named two-provider acceptance providers."]
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    apiShape: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    auth: { method: "api_key", env: ["OPENROUTER_API_KEY"], required: true, humanAction: "Create or provide an OpenRouter API key with free-model access." },
    defaultHeaders: { "HTTP-Referer": "https://steadyroute.local", "X-Title": "SteadyRoute Local" },
    models: [
      model("openrouter/free", {
        contextWindow: 200000,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "known" },
        freeTier: { status: "known", notes: "OpenRouter free router; daily free caps are account-level and provider-controlled." }
      }),
      model("cohere/north-mini-code:free", {
        contextWindow: 256000,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Free model discovered from OpenRouter /models." }
      })
    ],
    catalogSource: "OpenRouter /models + reference research",
    notes: ["Requires valid OpenRouter account key; invalid keys are classified as auth_failed."]
  },
  {
    id: "groq",
    displayName: "Groq",
    apiShape: "openai-compatible",
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    auth: { method: "api_key", env: ["GROQ_API_KEY"], required: true, humanAction: "Create or provide a Groq API key; no payment should be required for free-tier validation." },
    models: [
      model("openai/gpt-oss-20b", {
        contextWindow: 131072,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "unknown", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Groq free tier is RPM/TPM limited; exact remaining quota is provider-controlled." }
      }),
      model("llama-3.3-70b-versatile", {
        contextWindow: 131072,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "unknown", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Groq free tier is RPM/TPM limited; exact remaining quota is provider-controlled." }
      })
    ],
    catalogSource: "Groq docs + reference research",
    notes: ["Some Groq models reject unsupported reasoning parameters; SteadyRoute sends only conservative OpenAI chat fields."]
  },
  {
    id: "gemini",
    displayName: "Gemini API",
    apiShape: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    auth: { method: "api_key", env: ["GEMINI_API_KEY", "GOOGLE_API_KEY"], required: true, humanAction: "Create or provide a Gemini API key from AI Studio; no payment should be required for free-tier validation." },
    models: [
      model("gemini-2.5-flash", {
        contextWindow: 1048576,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Gemini free tier is quota limited; RESOURCE_EXHAUSTED maps to quota_exhausted/rate_limited." }
      }),
      model("gemini-2.5-flash-lite", {
        contextWindow: 1048576,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Gemini free tier is quota limited; schema support is not full JSON Schema." }
      })
    ],
    catalogSource: "Gemini API docs + reference research",
    notes: ["Gemini uses generateContent/streamGenerateContent and needs request translation."]
  }
];

export function providerById(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}

export function resolveProviderEnvKey(provider: ProviderDefinition): KeyMaterial {
  if (provider.auth.method === "anonymous") {
    return { provider: provider.id, alias: "anonymous", value: "anonymous", source: "anonymous", present: true };
  }
  for (const name of provider.auth.env) {
    const value = process.env[name];
    if (value && value.trim()) {
      return { provider: provider.id, alias: name, value: value.trim(), source: "env", present: true };
    }
  }
  if (provider.auth.method === "gh_token") {
    try {
      const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
      if (token) return { provider: provider.id, alias: "gh-cli", value: token, source: "gh_cli", present: true };
    } catch {
      // No local GitHub token; doctor will report the required human action.
    }
  }
  return { provider: provider.id, alias: "missing", value: null, source: "none", present: false };
}

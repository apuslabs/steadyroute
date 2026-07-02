import { execFileSync } from "node:child_process";
import type { KeyMaterial, ProviderDefinition, ProviderModel } from "./types.js";

function model(id: string, partial: Partial<ProviderModel> = {}): ProviderModel {
  return {
    id,
    label: partial.label,
    contextWindow: partial.contextWindow ?? 128000,
    priority: partial.priority,
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
    id: "opencode_free",
    displayName: "OpenCode Free",
    status: "verified",
    apiShape: "openai-compatible",
    baseUrl: "https://opencode.ai/zen/v1/chat/completions",
    auth: { method: "anonymous", env: [], required: false, humanAction: null },
    defaultHeaders: { "x-opencode-client": "desktop" },
    models: [
      model("big-pickle", {
        label: "OpenCode Free Big Pickle",
        contextWindow: 200000,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "unknown", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "No-auth OpenCode Free route verified with a live chat completion; upstream capacity and policy are provider-controlled." }
      }),
      model("deepseek-v4-flash-free", {
        label: "OpenCode Free DeepSeek V4 Flash",
        contextWindow: 200000,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "unknown", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "No-auth OpenCode Free route discovered from 9Router and verified with a live chat completion." }
      }),
      model("mimo-v2.5-free", {
        label: "OpenCode Free MiMo V2.5",
        contextWindow: 200000,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "unknown", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "No-auth OpenCode Free route discovered from OpenCode's public model list." }
      })
    ],
    catalogSource: "9Router OpenCode Free registry + live no-auth probe",
    evidence: [
      "Reference-derived keyless candidate from 9Router/OpenCode public routes.",
      "Live no-auth chat completion succeeded during 2026-07-01 provider smoke."
    ],
    notes: ["Uses the public OpenCode Free endpoint with provider-required public bearer marker, not a user API key."]
  },
  {
    id: "github_models",
    displayName: "GitHub Models",
    status: "verified",
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
    evidence: [
      "Live SteadyRoute chat request succeeded with a local GitHub CLI token.",
      "Provider returned rate-limit headers; Codex dogfood later hit effective token limits, so it is verified for chat but not full Codex startup in this environment."
    ],
    notes: ["Uses local GitHub CLI token when no explicit environment token is present."]
  },
  {
    id: "kilo",
    displayName: "Kilo anonymous OpenRouter free route",
    status: "verified",
    apiShape: "openai-compatible",
    baseUrl: "https://api.kilo.ai/api/openrouter/chat/completions",
    auth: { method: "anonymous", env: [], required: false, humanAction: null },
    defaultHeaders: { "x-kilocode-editorname": "SteadyRoute" },
    models: [
      model("kilo-auto/free", {
        label: "Kilo Auto Free",
        contextWindow: 256000,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Keyless Kilo free route verified locally; Kilo reports zero-cost free model pricing and may train on prompts." }
      }),
      model("openrouter/free", {
        label: "Kilo anonymous free router",
        contextWindow: 200000,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "community-reported", jsonMode: "unknown" },
        freeTier: { status: "community-reported", notes: "Keyless path verified locally; upstream model and provider may vary per request." }
      })
    ],
    catalogSource: "OmniRoute Kilo registry + live anonymous probe",
    evidence: [
      "Reference-derived keyless Kilo route from OmniRoute and 9Router-style provider research.",
      "Published npm CLI and Codex CLI smoke reached /v1/responses through SteadyRoute with stored_keys=0 and Kilo/openrouter/free attempts."
    ],
    notes: ["Keyless best-effort provider used for validation and fallback; not one of the named two-provider acceptance providers."]
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    status: "verified",
    apiShape: "openai-compatible",
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    auth: { method: "api_key", env: ["OPENROUTER_API_KEY"], required: true, humanAction: "Create or provide an OpenRouter API key with free-model access." },
    defaultHeaders: { "HTTP-Referer": "https://steadyroute.local", "X-Title": "SteadyRoute Local" },
    models: [
      model("openrouter/free", {
        contextWindow: 200000,
        priority: { coding: 30 },
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "known" },
        freeTier: { status: "known", notes: "OpenRouter free router; daily free caps are account-level and provider-controlled." }
      }),
      model("cohere/north-mini-code:free", {
        contextWindow: 256000,
        priority: { coding: 70 },
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Free model discovered from OpenRouter /models." }
      }),
      model("qwen/qwen3-coder:free", {
        contextWindow: 1048576,
        priority: { coding: 5 },
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Free coding model discovered from OpenRouter /models; exact capacity is account-level and provider-controlled." }
      }),
      model("qwen/qwen3-next-80b-a3b-instruct:free", {
        contextWindow: 262144,
        priority: { coding: 10 },
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "known" },
        freeTier: { status: "known", notes: "Free tool-capable model discovered from OpenRouter /models; exact capacity is account-level and provider-controlled." }
      }),
      model("meta-llama/llama-3.3-70b-instruct:free", {
        contextWindow: 131072,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Free tool-capable model discovered from OpenRouter /models; exact capacity is account-level and provider-controlled." }
      }),
      model("openai/gpt-oss-120b:free", {
        contextWindow: 131072,
        priority: { coding: 15 },
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Free tool-capable model discovered from OpenRouter /models; exact capacity is account-level and provider-controlled." }
      }),
      model("openai/gpt-oss-20b:free", {
        contextWindow: 131072,
        priority: { coding: 20 },
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Free tool-capable model discovered from OpenRouter /models; exact capacity is account-level and provider-controlled." }
      }),
      model("google/gemma-4-31b-it:free", {
        contextWindow: 131072,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Free tool-capable model discovered from OpenRouter /models; exact capacity is account-level and provider-controlled." }
      }),
      model("nvidia/nemotron-3-super-120b-a12b:free", {
        contextWindow: 131072,
        capabilities: { chat: "known", responses: "estimated", streaming: "known", toolCalls: "known", jsonMode: "unknown" },
        freeTier: { status: "known", notes: "Free tool-capable model discovered from OpenRouter /models; exact capacity is account-level and provider-controlled." }
      })
    ],
    catalogSource: "OpenRouter /models + reference research",
    evidence: [
      "OpenRouter /models worked with an exported key during 2026-07-01 research.",
      "OpenRouter chat succeeded through the published SteadyRoute npm CLI with an environment key on 2026-07-02."
    ],
    notes: ["Requires a valid OpenRouter account key; invalid keys are classified as auth_failed."]
  },
  {
    id: "groq",
    displayName: "Groq",
    status: "configured",
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
    evidence: [
      "Adapter and conservative OpenAI-compatible request shaping are implemented.",
      "No GROQ_API_KEY was present during 2026-07-01 validation, so live SteadyRoute traffic is blocked on user key setup."
    ],
    notes: ["Some Groq models reject unsupported reasoning parameters; SteadyRoute sends only conservative OpenAI chat fields."]
  },
  {
    id: "gemini",
    displayName: "Gemini API",
    status: "configured",
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
    evidence: [
      "Gemini adapter translation is implemented for generateContent/streamGenerateContent.",
      "No GEMINI_API_KEY/GOOGLE_API_KEY was present during 2026-07-01 validation, so live SteadyRoute traffic is blocked on user key setup."
    ],
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

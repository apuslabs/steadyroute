# 2026-07-02 Provider Coverage Matrix

This matrix satisfies SR-MVP-P0 in `docs/mvp-acceptance.md`. It is a clean-room
coverage and evidence record, not copied implementation from any reference
router.

## Status Legend

- `verified`: a real request succeeded through SteadyRoute.
- `configured`: adapter or catalog entry exists, but validation is blocked by
  credentials, account state, quota, region, or manual setup.
- `catalog-only`: provider is tracked as a candidate, but no adapter is active.
- `broken`: validation failed and the failure reason is known.
- `deprecated`: provider or endpoint should not be selected by default.

Unknown means unknown. It does not mean zero, unlimited, or safe to assume.

## Reference Inputs

- 9Router: provider aggregation, OpenAI-compatible local endpoint, automatic
  fallback, free providers such as Kiro/Kilo-style routes and OpenCode Free, and
  many API-key providers. Source:
  <https://github.com/decolua/9router>
- FreeLLMAPI: OpenAI-compatible `/v1`, `/v1/responses` translation shim,
  streaming, tool calling, provider failover, encrypted keys, health checks, and
  per-key rate tracking across free provider pools. Source:
  <https://github.com/tashfeenahmed/freellmapi>
- OmniRoute: broad provider catalog, free-provider aggregation, Kilo/OpenCode
  style permanently-free or no-token-cap routes, and explicit separation of
  counted free-token pools from uncounted free providers. Source:
  <https://github.com/diegosouzapw/OmniRoute>
- OpenRouter docs: OpenAI-like Chat API, streaming via `stream: true`, tool
  calling, key/credit endpoint, and documented free-model limits. Source:
  <https://openrouter.ai/docs/api-reference/overview> and
  <https://openrouter.ai/docs/api-reference/limits>
- GitHub Models docs: free playground/API experimentation, PAT or GitHub token
  access, OpenAI-compatible chat endpoint, and free API rate limits by model
  class. Source: <https://docs.github.com/en/github-models>
- Gemini API docs: per-project rate limits measured by RPM, TPM, and RPD;
  `429 RESOURCE_EXHAUSTED` for rate/spend limits; function calling and OpenAI
  compatibility docs exist but native API shape remains non-OpenAI. Source:
  <https://ai.google.dev/gemini-api/docs/rate-limits>
- Groq docs: OpenAI compatibility, rate limits by RPM/RPD/TPM/TPD, account-level
  limits, tool/structured-output docs, and response headers for rate-limit
  information. Source: <https://console.groq.com/docs/rate-limits>

## Implemented Provider Matrix

| Provider | SteadyRoute id | Auth method | API shape | Status | Models tracked | Limits and quota evidence | Streaming | Tool calls / schema | Retry and error behavior | Evidence source |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OpenCode Free | `opencode_free` | Anonymous/public marker | OpenAI-compatible chat | `verified` | `big-pickle`, `deepseek-v4-flash-free`, `mimo-v2.5-free` | Declared limits unknown; observed keyless chat success; quota unknown and must stay `unknown` in explain unless provider reports it. | Known by live SSE-capable route, but long-agent stability is not yet proven. | Unknown; should not be preferred for tool-rich requests until live tool evidence exists. | Network/provider failures should be fallbackable; schema/tool failures should be classified as compatibility issues. | Reference-derived from 9Router/OpenCode routes; live no-auth chat smoke on 2026-07-01; implemented in `src/providers.ts`. |
| Kilo anonymous | `kilo` | Anonymous/public bearer | OpenAI-compatible chat via Kilo gateway | `verified` | `kilo-auto/free`, `openrouter/free` | Declared exact limits unknown; observed zero stored keys and successful real SteadyRoute `/v1/responses` Codex smoke; quota unknown. | Verified streaming path with SteadyRoute stream metadata; free upstream can still produce `stream_interrupted`. | `kilo-auto/free` is marked known; `openrouter/free` is community-reported because upstream model varies. | `stream_interrupted` is retryable/fallbackable/cooldown-worthy; malformed stream tool calls must not be treated as clean completions. | Reference-derived from OmniRoute and 9Router-style provider research; npm CLI Codex smoke through request IDs in local ledger on 2026-07-01. |
| GitHub Models | `github_models` | `GITHUB_MODELS_TOKEN`, `GITHUB_TOKEN`, or local `gh auth token` | OpenAI-compatible chat endpoint | `verified` | `gpt-4o-mini` | Free API usage is rate limited by model class; GitHub docs expose RPM/RPD/token/concurrency limits; live provider returned rate-limit headers. | Supported for chat endpoint; full Codex startup hit an effective 8k token input limit in this environment. | `gpt-4o-mini` marked known for tool calls and JSON mode, but large Responses-shaped Codex turns are limited by token caps. | 413/token-limit errors map to `context_too_large`; auth/token errors map to `auth_failed`. | Official GitHub Models docs plus live SteadyRoute chat probe with local GitHub token on 2026-07-01. |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` or encrypted key store | OpenAI-compatible chat | `verified` | `openrouter/free`, `cohere/north-mini-code:free`, `qwen/qwen3-coder:free`, `qwen/qwen3-next-80b-a3b-instruct:free`, `meta-llama/llama-3.3-70b-instruct:free`, `openai/gpt-oss-120b:free`, `openai/gpt-oss-20b:free`, `google/gemma-4-31b-it:free`, `nvidia/nemotron-3-super-120b-a12b:free` | Official docs expose `/api/v1/key`, free-model RPM and daily request limits, and credit fields; live SteadyRoute requests now preserve provider-reported usage while quota remains `unknown` unless the provider reports it. | Verified through live SteadyRoute streaming on `openrouter/free`; free-model upstream selection can still vary and occasionally rate-limit. | Official docs support tool calling and structured outputs; live SteadyRoute tool-call request returned a `report_package` tool call through OpenRouter. | Invalid keys classify as `auth_failed`; free upstream 429s classify as `rate_limited` with cooldown/fallback metadata; do not treat unknown quota as unlimited. | Official OpenRouter docs plus live SteadyRoute/OpenRouter validation on 2026-07-02 with request ids `02_tmCYK3BEJUuJmCf`, `t9TjE7HTld9jxQNo8f`, and `FFO1o-lxcz3I_CmQZK`. |
| Groq | `groq` | `GROQ_API_KEY` or encrypted key store | OpenAI-compatible chat | `configured` | `openai/gpt-oss-20b`, `llama-3.3-70b-versatile` | Official docs publish RPM/RPD/TPM/TPD and rate-limit headers; no local key was available during validation. | Officially available for chat models; SteadyRoute implementation must still verify live streaming once a key is present. | Groq docs include tool and structured-output surfaces; current model metadata remains `unknown` until live tool smoke. | 429 maps to `rate_limited` or `quota_exhausted`; 401 maps to `auth_failed`; model/request errors should not be retried blindly. | Official Groq docs and implemented adapter; live validation blocked on missing key. |
| Gemini API | `gemini` | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | Native Gemini `generateContent` / `streamGenerateContent` | `configured` | `gemini-2.5-flash`, `gemini-2.5-flash-lite` | Official docs state RPM/TPM/RPD and project-level quotas; exact active limits are visible in AI Studio, not assumed by SteadyRoute. | Native streaming is available through Gemini API; SteadyRoute adapter must translate to OpenAI-compatible SSE. | Function calling is supported, but schema support is not full JSON Schema; unsupported schema keys must be stripped or classified. | `429 RESOURCE_EXHAUSTED` maps to `rate_limited` or `quota_exhausted`; schema rejection maps to `schema_rejected`. | Official Gemini docs and implemented adapter; live validation blocked on missing key. |

## Catalog-Only / Deferred Candidates

These candidates were surfaced by 9Router, FreeLLMAPI, OmniRoute, or public docs
but are not active SteadyRoute MVP adapters yet.

| Provider candidate | Status | Reason |
| --- | --- | --- |
| Pollinations | `broken` | Public model listing was reachable in prior research, but `/v1/chat/completions` returned auth-required behavior; do not present as no-login healthy. |
| LLM7 | `catalog-only` | Reference projects list anonymous or free routes; no SteadyRoute adapter or live validation yet. |
| OVH AI Endpoints anonymous routes | `catalog-only` | Candidate from reference projects; no local adapter or ToS/region validation yet. |
| AI Horde | `catalog-only` | Anonymous/community route candidate, but latency and API shape differ from the current MVP path. |
| Cloudflare AI Gateway / Workers AI | `catalog-only` | Requires account setup and provider-specific API shape; not in current MVP adapter set. |
| Cerebras, Mistral, Cohere, NVIDIA NIM, Z.ai, HuggingFace Router, Ollama Cloud | `catalog-only` | Useful future low-cost/free candidates from reference projects; not required for the current two-provider MVP gate. |
| Kiro / subscription OAuth providers | `catalog-only` | Reference projects surface them, but SteadyRoute avoids OAuth/manual-login automation until user setup is explicit. |

## Near-Term Validation Targets

Minimum SR-MVP-04 requires two real providers among OpenRouter, Gemini, Groq, and
GitHub Models. Current state:

1. `github_models`: verified for short OpenAI-compatible chat and rate-limit
   source labels, but full Codex startup can exceed its effective 8k request
   limit in this environment.
2. `openrouter`: verified through SteadyRoute after a valid environment key was
   provided. It now satisfies the second SR-MVP-04 provider slot alongside
   GitHub Models, while free-model 429s remain expected provider behavior.
3. `groq` or `gemini`: next expansion targets once the user provides a key or
   completes account setup. Both adapters exist and do not require payment for
   normal free-tier validation according to public docs, but active quotas must
   be read from provider responses or account consoles.

Keyless `kilo` and `opencode_free` are important for default usability and
smoke tests, but they do not satisfy SR-MVP-04 because that gate explicitly
requires two real providers among OpenRouter, Gemini, Groq, and GitHub Models.

## Runtime Surfaces Updated

The same status and evidence fields are exposed in runtime surfaces so this
matrix does not drift silently:

- `steadyroute doctor` shows `status=...` and provider evidence lines.
- `steadyroute models --json` includes `provider_status` and `evidence`.
- `GET /v1/models` includes `steadyroute.provider_status` and
  `steadyroute.evidence` for each model.

## Evidence Links To Fill During Acceptance

Populate this section with request ids from the final SR-MVP acceptance run.

| Scenario | Provider | Request id | Evidence bundle path | Result |
| --- | --- | --- | --- | --- |
| SR-MVP-01 | GitHub Models | `qHY6n3z7Qoep43nriu` | `.steadyroute-acceptance/20260702-084356-npm-013-gate-smoke` | passed with Node OpenAI SDK client through `/v1/chat/completions` using published `steadyroute@0.1.3` |
| SR-MVP-02 | OpenRouter | `t9TjE7HTld9jxQNo8f` | `.steadyroute-acceptance/20260702-084356-npm-013-gate-smoke` | passed with streaming SSE and ledger stream metadata |
| SR-MVP-03 | Kilo anonymous | `_LoR0_grADj8kWc8Xf` | `.steadyroute-acceptance/20260702-090642-npm-013-kilo-agent-tiny` | passed with Codex CLI `/v1/responses`, provider credentials unset, real file edit, and final `npm test` pass |
| SR-MVP-04 provider 1 | GitHub Models | `4aw42DZlW9pk2vb6m1` | `.steadyroute-acceptance/20260702-083915-sr-mvp04-openrouter-retry` | passed with provider allowlist |
| SR-MVP-04 provider 2 | OpenRouter | `02_tmCYK3BEJUuJmCf` | `.steadyroute-acceptance/20260702-083915-sr-mvp04-openrouter-retry` | passed with provider allowlist |
| SR-MVP-06 | OpenRouter | `FFO1o-lxcz3I_CmQZK` | `.steadyroute-acceptance/20260702-084356-npm-013-gate-smoke` | passed; provider returned `report_package` tool call and explain shows tool request shape |
| SR-MVP-07 | OpenRouter invalid -> valid key | `B-xbizZ5wjZgZKoJID` | `.steadyroute-acceptance/20260702-084356-npm-013-gate-smoke` | passed; invalid OpenRouter key classified `auth_failed`, then fallback succeeded |
| SR-MVP-08 | GitHub Models / OpenRouter | `qHY6n3z7Qoep43nriu`, `1crHzqDG6liWh6eAU-` | `.steadyroute-acceptance/20260702-084356-npm-013-gate-smoke` | passed; usage/rate-limit values are source-labeled and unknown quota remains unknown |
| SR-MVP-09 | OpenRouter | `1crHzqDG6liWh6eAU-` | `.steadyroute-acceptance/20260702-084356-npm-013-gate-smoke` | passed; pre-restart request explained after stop/start |
| SR-MVP-10 | OpenRouter | `1crHzqDG6liWh6eAU-` | `.steadyroute-acceptance/20260702-084356-npm-013-gate-smoke` | passed for direct `/v1/responses` |

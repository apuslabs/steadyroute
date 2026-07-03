# 2026-07-01 Reference Router Research

## Scope

FreeLLMAPI, 9Router, and OmniRoute were inspected as behavior references only. No source code was copied into SteadyRoute.

## Findings Applied

- Keep `/v1/responses` distinct from `/v1/chat/completions`; Responses has its own stream event semantics and coding-agent request shapes.
- Record per-candidate skip reasons before routing. Opaque "all models exhausted" errors are a product failure for this MVP.
- Separate provider, key, and model failure scope. The MVP cooldown scope is provider/model/key alias.
- Treat provider-reported usage and quota headers as provider-reported, local token counts as estimated, and missing quota as unknown.
- Hold route decisions in a local ledger, not only logs, so `steadyroute explain <request-id>` survives restart.
- Gemini is a non-trivial adapter: it requires `generateContent` / `streamGenerateContent` translation and only supports a subset of JSON Schema in tool declarations.
- Streaming must record first chunk, final chunk, chunk count, final text, and whether terminal events were seen.
- Tool requests must be capability-aware and visible in explain output, even when the final provider returns a normal answer rather than tool calls.

## Provider Notes

- GitHub Models worked with the local GitHub CLI token against `https://models.inference.ai.azure.com/chat/completions`, returning `gpt-4o-mini` output plus rate-limit headers. The newer `github.models.ai` host failed TLS from this environment, so the MVP uses the Azure endpoint and records its deprecation headers as provider-reported metadata.
- Kilo anonymous worked with `https://api.kilo.ai/api/openrouter/chat/completions`, `Authorization: Bearer anonymous`, `X-KILOCODE-EDITORNAME`, and model `openrouter/free`. It returned real OpenAI-compatible chat and SSE responses.
- OpenRouter `/models` worked with the exported key, but chat returned `401 User not found`, so the key currently cannot satisfy acceptance traffic.
- Gemini and Groq keys were absent from the environment during initial implementation.

## Deferred

- Anthropic Messages support is deferred because the MVP gate requires OpenAI Chat and Responses only.
- Complex tool-call rescue, inline tool-call parsing, and schema repair beyond Gemini unsupported-key stripping are deferred until dogfood produces specific failures.
- Dynamic catalog sync is deferred; the MVP uses built-in seed providers plus visible catalog source/version reporting.

## Dogfood Findings

- GitHub Models `gpt-4o-mini` and `gpt-4o` both rejected Codex CLI's startup Responses request with `413 tokens_limit_reached` and an effective `8000 tokens` maximum. The request included long system/developer instructions plus local tool schemas, so it is not enough for full Codex agent dogfood in this environment.
- Kilo anonymous successfully accepts the same large streamed request, but free-router upstream models may emit text-form tool calls or reasoning-only chunks instead of Responses-compatible tool events. SteadyRoute now records these as stream/tool compatibility evidence and classifies malformed stream tool calls rather than treating them as completed coding-agent work.
- With the currently available credentials, the real provider matrix is GitHub Models plus Kilo anonymous. The strict acceptance gate still requires a second named provider among OpenRouter, Gemini, Groq, and GitHub Models. OpenRouter currently returns `401 User not found`; Gemini and Groq keys are absent.

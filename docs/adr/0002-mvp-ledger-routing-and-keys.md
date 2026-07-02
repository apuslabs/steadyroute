# ADR 0002: MVP Ledger, Routing, and Key Handling

Status: Accepted

Date: 2026-07-01

## Context

The MVP acceptance gate requires SteadyRoute to accept real local coding-agent traffic, route to real no-cost providers where credentials or keyless access are available, and explain both successful and failed requests. Reference-router research showed that generic exhaustion errors, missing stream terminal events, tool-schema drift, and mixed key/account failure scopes are recurring failure modes.

## Decision

The MVP uses a small clean-room TypeScript core with these boundaries:

- Provider adapters expose one chat-oriented internal request surface.
- `/v1/responses` is translated into the internal chat surface, then translated back into a Responses-compatible response shape.
- Each HTTP request gets a SteadyRoute request id and a SQLite request row before provider routing starts.
- Each provider attempt gets a separate attempt row with provider/model/key alias, upstream status, normalized error class, fallback decision, response headers, body excerpt/body, usage evidence, and timing.
- Full request and response bodies are stored locally by default.
- Provider keys can come from environment, encrypted local SQLite key store, GitHub CLI token, or anonymous/keyless provider mode.
- Client-facing local API keys are placeholders for MVP. Upstream provider keys are never required in the OpenAI-compatible client command.

## Fallback Semantics

Fallback is based on normalized error classes, not raw HTTP status alone.

Fallbackable MVP classes include auth/account/provider/model failures where another configured provider may succeed: `auth_failed`, `billing_required`, `quota_exhausted`, `rate_limited`, `provider_down`, `model_removed`, `context_too_large`, `tool_unsupported`, `stream_interrupted`, `network_error`, `timeout`, and `unknown_provider_error`.

Non-fallbackable MVP classes are client/request-shape failures: `request_invalid` and `schema_rejected`.

Cooldowns are scoped to provider/model/key alias. This intentionally avoids provider-wide quarantine for one bad key or one removed model.

Provider and model allowlists/denylists are evaluated before capability, context, and cooldown checks. Model list entries may be a bare model id, `provider/model`, or `steadyroute:provider/model`; skipped candidates are recorded with explicit allowlist or denylist reasons.

Structured output requests are detected from Chat Completions `response_format` and Responses `text.format`. The router prefers models cataloged with known JSON-mode support, skips models explicitly cataloged as JSON-mode unsupported, and reports `schema_rejected` when no allowed candidate can satisfy the structured-output requirement.

## Context-Window Preflight

Before provider calls, the router applies a conservative request-size estimate against each candidate model's catalog `contextWindow`. The estimate uses the normalized chat prompt text and requested output cap when present, or a default output reserve otherwise. This is not exact provider tokenization and is not used for billing or usage reporting. It exists to avoid provider calls that are clearly too large and to record `context_too_large` skip evidence in the ledger and `steadyroute explain`.

## Provider Choice

The MVP starts with:

- GitHub Models, because the local `gh` token is available and the OpenAI-compatible endpoint reports usage and rate-limit headers.
- Kilo anonymous `openrouter/free`, because it was live-probed as a keyless no-cost route with streaming support.
- OpenRouter, Groq, and Gemini adapters, because they are named preferred providers in the acceptance protocol and reference research consistently identifies them as useful no-cost candidates.

Kilo is useful engineering evidence but does not replace the acceptance gate requirement for two providers among OpenRouter, Gemini, Groq, and GitHub Models.

## Consequences

This design keeps the MVP small but makes the diagnostic surface durable. It does not attempt Claude/Anthropic Messages, dashboard, media endpoints, hosted mode, billing, or multi-tenant authentication.

Provider catalog facts are currently built in and labeled with uncertainty. The catalog repo remains the long-term source for provider metadata, but the MVP avoids pretending unknown free quota values are exact.

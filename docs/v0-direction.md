# SteadyRoute v0 Direction

SteadyRoute v0 is a local-first, OpenAI-compatible router focused on making fragile free-tier and low-cost LLM provider pools more stable, diagnosable, and auditable for coding-agent workflows.

SteadyRoute is experimental. It does not create free capacity, bypass provider limits, or guarantee availability. It helps users understand, route around, and recover from provider instability while respecting upstream provider terms.

## Problem

Free-tier provider pools are useful, but they are not stable infrastructure by default. Users can connect multiple providers and still lose work because failures are hard to classify:

- A request may fail because of rate limits, quota exhaustion, model removal, provider downtime, context limits, malformed tool schemas, missing protocol support, or network issues.
- Generic errors such as "all models exhausted" often hide the actionable root cause.
- "OpenAI-compatible" is no longer one protocol surface: coding tools increasingly depend on Chat Completions, Responses, streaming, and tool-call behavior.
- Free-tier quota data is often incomplete. Some limits are documented, some are observed, and some are unknown.
- Local-first users need to know where configuration, keys, traces, and state live before they trust a router.

## v0 Hypothesis

Users of free-tier LLM routers need a gateway that is more transparent and recoverable before they need another large provider catalog.

SteadyRoute v0 tests this hypothesis:

> A local router that records the full request path, classifies failures, exposes routing decisions, and verifies protocol compatibility will be more useful than a larger but opaque fallback chain.

## v0 Goals

- Provide a local OpenAI-compatible endpoint.
- Support `/v1/models`, `/v1/chat/completions`, and `/v1/responses`.
- Support streaming for Chat Completions and Responses-compatible clients.
- Implement a small number of real provider adapters, starting with OpenAI-compatible providers and one non-trivial provider shape.
- Route through named policies rather than requiring users to manually manage raw fallback chains.
- Record a local request ledger with enough detail to explain every request.
- Classify provider and request failures into actionable error classes.
- Track quota evidence without pretending unknown values are precise.
- Provide CLI-first diagnostics through `steadyroute doctor` and `steadyroute explain <request-id>`.

## v0 Non-Goals

- No public remote gateway mode.
- No multi-tenant billing or hosted control plane.
- No desktop app or heavy dashboard as a v0 requirement.
- No embeddings, image, audio, or moderation endpoints in v0.
- No claim of unlimited free LLM access.
- No hidden tool execution. SteadyRoute is a model gateway, not a tool runner.
- No dependency on a commercial observability product for core tracing.

## MVP Shape

The first dogfoodable MVP should include:

- CLI:
  - `steadyroute start`
  - `steadyroute doctor`
  - `steadyroute keys add`
  - `steadyroute models`
  - `steadyroute explain <request-id>`
- Local server:
  - `GET /health`
  - `GET /v1/models`
  - `POST /v1/chat/completions`
  - `POST /v1/responses`
- Storage:
  - encrypted local provider keys
  - provider/key/model state
  - request ledger
  - route attempts
  - quota observations
- Routing:
  - `auto` policy
  - exact model mode
  - allowlist and denylist support
  - cooldown for retryable provider/key/model failures
- Diagnostics:
  - local config paths
  - provider key presence and health
  - model availability
  - protocol support
  - streaming support
  - tool-call conformance result when a request uses tools

## Request Ledger

The request ledger is a core product surface, not just analytics.

Each request should record:

- request id
- input endpoint and protocol
- full prompt and request body by default, stored locally
- selected routing policy
- catalog version
- provider/model/key candidates
- skipped candidates and reasons
- upstream attempts
- provider raw status and safe error excerpt
- fallback/cooldown decisions
- final provider/model
- response or streaming chunks when available
- usage data, marked as provider-reported, locally estimated, or unknown

The default trace mode is full local audit. Users should be told that prompts and responses are stored locally and should be able to change retention or disable full-body tracing later.

## Error Classes

v0 should normalize common failures into a small taxonomy:

- `auth_failed`
- `billing_required`
- `quota_exhausted`
- `rate_limited`
- `provider_down`
- `model_removed`
- `context_too_large`
- `request_invalid`
- `schema_rejected`
- `tool_unsupported`
- `stream_interrupted`
- `network_error`
- `timeout`
- `unknown_provider_error`

Each class should say whether it is retryable, fallbackable, should trigger cooldown, or needs user action.

## Product Principle

SteadyRoute should not make fragile capacity look reliable by hiding uncertainty.

It should make uncertainty visible:

- known vs observed vs estimated vs unknown limits
- provider-reported vs locally estimated usage
- exact route chosen and why
- which failures were recoverable and which were not

## Near-Term Roadmap

1. Build the local router and request ledger.
2. Add two or three real provider adapters.
3. Add Chat Completions and Responses compatibility tests.
4. Add `doctor` and `explain`.
5. Dogfood with real coding agents and real projects.
6. Use dogfood and community feedback to decide whether to expand providers, protocol surfaces, dashboard, or Anthropic Messages support next.

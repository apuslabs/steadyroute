# SteadyRoute MVP Build Brief

This brief defines the MVP build target for SteadyRoute. It is written for
implementation agents and maintainers. It should be used together with
`docs/mvp-acceptance.md`, which defines the dogfood acceptance gate.

## Objective

Build a CLI-first, local-first free and low-cost LLM router that is more stable
and more explainable than opaque fallback chains.

The MVP is not just a protocol proxy. It must help users understand provider
fragility, route around failures, and continue long-running coding-agent work
with less manual debugging.

## Product Boundaries

SteadyRoute v0 is:

- local-only by default
- CLI-first
- OpenAI-compatible for `/v1/models`, `/v1/chat/completions`, and
  `/v1/responses`
- focused on free-tier and low-cost provider pools
- transparent about provider uncertainty
- backed by a local request ledger

SteadyRoute v0 is not:

- a hosted gateway
- a dashboard product
- a desktop app
- a billing system
- a provider limit bypass tool
- a guarantee of free capacity

## Reference Projects

Use these projects as behavior and coverage references:

- 9router
- FreeLLMAPI
- OmniRoute

Reference use is allowed for:

- provider lists
- free and low-cost model candidates
- auth patterns
- base URLs
- documented and observed provider quirks
- fallback behavior
- issue-reported pain points
- protocol compatibility pitfalls
- routing and CLI UX ideas

Do not copy source code into SteadyRoute. Implement SteadyRoute as a clean-room
codebase and document technical decisions in ADRs.

## Provider Strategy

Provider aggregation is part of the MVP, not a later polish item.

Research and track the provider inventory from the reference projects and
public provider documentation. The goal is inventory alignment with 9router,
FreeLLMAPI, and OmniRoute, not only broad category coverage. If a provider is
covered by the reference projects, SteadyRoute should either implement it,
document why it is blocked, or explicitly mark it as out of scope with evidence.

Start with providers likely to be usable without payment or with a free account:

- OpenRouter free models
- Gemini free tier
- Groq free tier
- GitHub Models
- Cloudflare Workers AI
- Cerebras
- NVIDIA-hosted models
- Mistral free or trial access
- Pollinations
- LLM7 or similar OpenAI-compatible free endpoints
- OVH or similar trial/free model endpoints
- local providers used as fallback or compatibility targets
- keyless or anonymous OpenAI-compatible providers discovered from reference
  projects
- other low-cost providers that are useful for coding-agent workloads

Each provider/model entry must have a status:

- `verified`: real request succeeded through SteadyRoute
- `implemented-unverified`: adapter exists but has not completed real
  validation
- `blocked-by-auth`: validation is blocked by credentials, account state,
  OAuth, device flow, region, quota, or manual setup
- `catalog-only`: metadata is documented but not implemented or validated
- `broken`: validation failed and the failure is documented
- `deprecated`: provider or endpoint should not be selected by default

Provider metadata must separate:

- declared limits
- observed limits
- estimated limits
- unknown limits
- community-reported limits

Never present unknown quota, context, tool-call, or streaming behavior as exact
provider truth.

The competitive provider gate is:

- the provider inventory is aligned with the providers found in 9router,
  FreeLLMAPI, and OmniRoute, with status for every candidate
- at least one anonymous or keyless route works after install without user
  login
- at least four real providers complete SteadyRoute smoke requests
- at least two verified providers come from the primary free or low-cost set:
  OpenRouter, Gemini, Groq, GitHub Models, Kilo, Pollinations, LLM7,
  Cloudflare, Cerebras, NVIDIA, or Mistral
- at least one provider that requires user auth has a CLI auth/test entry point,
  even if the browser login or device-flow step needs user assistance

## Provider Auth Policy

Prefer no-cost validation paths. If a provider requires login, API key creation,
OAuth, CAPTCHA, ToS acceptance, manual browser action, billing setup, card
binding, payment, or organization access, stop and ask the user to complete that
step.

Do not bypass provider controls. Do not scrape private credentials. Do not evade
rate limits, region limits, or Terms of Service.

The CLI should expose provider setup as a first-class flow:

- `steadyroute providers list`
- `steadyroute providers status`
- `steadyroute providers auth <provider>`
- `steadyroute providers test <provider>`
- `steadyroute keys add`
- `steadyroute keys list`
- `steadyroute keys remove`

For OAuth, device-code, browser login, CAPTCHA, or ToS acceptance, the command
may open the browser, print a URL/code, or pause for the user to complete the
provider-owned step. Automation may help the user operate the browser, but it
must not bypass provider controls.

## Core Runtime Requirements

The MVP must implement:

- `GET /health`
- `GET /v1/models`
- `POST /v1/chat/completions`
- `POST /v1/responses`
- non-streaming Chat Completions
- streaming Chat Completions
- non-streaming Responses
- streaming Responses where the upstream route can support it
- local provider key storage
- local SQLite request ledger
- route candidate selection
- fallback and cooldown
- provider health state
- `steadyroute doctor`
- `steadyroute explain <request-id>`
- CLI commands for model listing, provider health, keys, config paths, and
  diagnostics export

The router must record enough local evidence to explain both success and
failure. It must not collapse all provider failures into a generic exhaustion
message.

## Routing Requirements

Every normal routing behavior should be expressed as a preset or policy.

The MVP should include:

- default automatic routing
- free-first routing
- stable coding-agent routing
- exact provider/model override
- allowlist support
- denylist support
- provider/model/key cooldown

Routing must consider:

- requested protocol surface
- streaming requirement
- tool-call or structured-output requirement
- context requirement
- provider health
- recent errors
- quota and rate-limit evidence
- user allowlist and denylist
- declared capabilities
- observed runtime behavior

## Failure Semantics

Classify failures before deciding whether to retry or fallback.

Required error classes include:

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

For streaming requests, SteadyRoute must keep tracing after the first token.
If a stream fails mid-response, record partial output, provider error evidence,
and whether automatic recovery was attempted or skipped. Do not present partial
streams as clean completions.

## Trace and Explainability

The local request ledger is a product surface.

Each accepted request should record:

- request id
- trace/span ids
- timestamp
- inbound endpoint
- full local request body by default
- selected policy
- route candidates
- skipped candidates and reasons
- attempts
- provider/model/key alias
- upstream status and safe error excerpts
- streaming lifecycle events
- partial and final output where available
- usage evidence
- quota and rate-limit evidence
- fallback and cooldown decisions

`steadyroute explain <request-id>` must make these facts understandable from the
CLI without requiring a dashboard.

## Implementation Workflow

Use small, reversible steps:

- check `git status` before editing
- work on a feature branch
- use subagents or worktrees for parallelizable research
- keep commits atomic
- preserve useful failed experiments as notes when they affect decisions
- write ADRs for durable technical decisions
- do not commit secrets or local acceptance evidence

Every buildable version should also leave a release trail:

- update `CHANGELOG.md` with user-visible changes, fixes, known gaps, and
  verification notes
- keep `package.json` and lockfile versions consistent
- run the relevant build, test, and MVP smoke checks before publishing
- commit version changes separately from unrelated feature work when practical
- push the branch after meaningful milestones
- tag released versions with `vX.Y.Z`
- publish successful package builds to npm
- create a GitHub release for published versions
- attach or link release artifacts such as npm package tarball metadata,
  acceptance evidence summaries, provider matrix snapshots, and benchmark notes

Do not treat local commits alone as a completed version. A completed version
must be traceable across git history, changelog, npm package version, tag,
release notes, and validation artifacts.

Good parallel research tracks:

- 9router provider coverage and failure modes
- FreeLLMAPI provider coverage and failure modes
- OmniRoute provider coverage and routing ideas
- provider documentation and free-tier constraints
- trace, ledger, and OpenTelemetry alignment

## Acceptance

The MVP is complete only when it satisfies the minimum gate in
`docs/mvp-acceptance.md`.

Final acceptance must use real providers and real clients or agents. Unit tests
may use mocks, but mocks cannot satisfy the MVP dogfood gate.

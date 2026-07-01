# ADR 0001: Router Core Direction

Status: Accepted

Date: 2026-07-01

## Context

SteadyRoute is intended to be a local-first router for fragile free-tier and low-cost LLM provider pools. The short-term goal is not to become a general enterprise gateway. The short-term goal is to make free-provider routing more stable, diagnosable, and auditable for coding-agent workflows.

Existing projects already prove demand for multi-provider LLM routing, fallback, and OpenAI-compatible endpoints. They also show recurring failure modes: opaque exhaustion errors, protocol drift between Chat Completions and Responses, tool-call incompatibility, streaming breakage, quota ambiguity, provider model drift, and local configuration fragility.

## Decision

Build a clean-room SteadyRoute implementation using:

- TypeScript
- Node.js
- Fastify for the local HTTP server
- undici / built-in fetch for upstream provider calls
- SQLite for local state
- Zod or JSON Schema validation at boundaries
- OpenTelemetry-compatible trace identifiers and span concepts, with a SteadyRoute-owned local request ledger

Do not use a fork of an existing router as the public product codebase.

Existing projects may be used as references for feature order, known failure modes, compatibility tests, and architecture patterns. Code should not be copied from those projects unless explicitly reviewed for license, attribution, and long-term maintainability.

## Rationale

TypeScript and Node.js give the fastest path to a cross-platform local CLI, local HTTP server, provider adapters, installer scripts, and coding-tool integrations.

Fastify is a pragmatic server substrate for v0:

- mature local server lifecycle
- route-level validation
- plugin boundaries
- streaming response support
- hooks suitable for request ledger instrumentation

SQLite is the right v0 storage layer:

- local-first
- easy to inspect and back up
- sufficient for request ledger, key state, provider health, quota observations, and configuration

OpenTelemetry is the right standard to align with, but not sufficient by itself for SteadyRoute's product needs. SteadyRoute needs a local request ledger that stores prompts, responses, route decisions, provider attempts, and failure explanations. OpenTelemetry-compatible IDs and spans should be used so future exporters are possible, but the local ledger remains the source of truth for `steadyroute explain`.

## Alternatives Considered

### Fork an existing router

Rejected as the public product starting point.

A fork can be useful as a research artifact or temporary experiment, but it would inherit a large feature surface and historical assumptions before SteadyRoute has validated its own product focus. The strongest evidence points to stability, diagnostics, protocol conformance, and auditability rather than simply changing catalog access or UI branding.

### Rust gateway

Deferred.

Rust is attractive for a high-throughput production gateway, and projects such as Helicone AI Gateway show this path can work. SteadyRoute v0 is not throughput-bound. The priority is fast iteration on provider quirks, policy, diagnostics, local state, and dogfood workflows.

### General-purpose gateway dependency

Deferred.

Projects such as LiteLLM, Bifrost, Portkey, Helicone, and Kong AI Gateway solve many general routing and gateway problems. SteadyRoute can learn from them, but the v0 focus is local-first free-provider diagnosis and coding-agent compatibility. Depending on a general gateway core would make the differentiated behavior harder to own.

## Consequences

SteadyRoute owns these core abstractions:

- provider definition
- provider adapter
- catalog integration
- routing policy
- error taxonomy
- request ledger
- quota evidence model
- `doctor` and `explain` user experience

SteadyRoute may reuse ecosystem libraries for:

- HTTP serving
- validation
- SQLite access
- encryption primitives
- OpenTelemetry export
- CLI parsing
- tests

The v0 codebase should stay small enough to dogfood quickly. Dashboard, desktop app, many-provider catalog expansion, embeddings, image/audio, and public remote gateway mode are intentionally out of scope until the router core proves useful.

## Acceptance Criteria

The v0 router core is acceptable when:

- a real coding agent can send a request through SteadyRoute to a real provider
- streaming works against at least one real provider
- `/v1/chat/completions` and `/v1/responses` both work for basic requests
- request ledger records full prompt, response, route attempts, and failure class locally
- `steadyroute explain <request-id>` can explain a successful or failed request
- `steadyroute doctor` can report config, key, provider, model, and protocol health
- failure handling is based on explicit error classes rather than a generic exhaustion message
- no tests or demo flows rely on mock providers as the final acceptance path

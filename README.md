# SteadyRoute

Self-healing free LLM router.

SteadyRoute is an experimental, local-first router for using fast-changing free-tier LLM model pools with less manual debugging. It gives you an OpenAI-compatible endpoint, routes around provider instability, and explains why requests fail when the model pool is exhausted, incompatible, rate limited, or temporarily unavailable.

SteadyRoute is powered by the separate [Open Free LLM Catalog](https://github.com/apuslabs/open-free-llm-catalog), an open catalog of provider metadata, model capabilities, limits, and known quirks.

> Experimental: SteadyRoute is early software. Free-tier availability is controlled by upstream providers, not by SteadyRoute.

## Why SteadyRoute

Free-tier model pools are useful, but they are also fragile. Providers change limits, remove models, reject request shapes, throttle traffic, and return errors that are hard to interpret from an AI coding tool.

SteadyRoute focuses on making that fragility visible and manageable:

- Route OpenAI-compatible requests through catalog-aware provider adapters.
- Diagnose keys, network access, provider health, quota state, schema compatibility, and tool-call support.
- Keep a local trace of routing decisions and fallback attempts.
- Explain failures with request IDs instead of opaque "all models exhausted" errors.
- Store provider keys locally in encrypted form.
- Stay local by default. SteadyRoute v1 is not a public gateway or hosted service.

## Features

- OpenAI-compatible local endpoint.
- Initial API support for `/v1/chat/completions`, `/v1/responses`, and `/v1/models`.
- `steadyroute doctor` for install, provider, key, network, quota, schema, tool-call, and compatibility checks.
- `steadyroute explain <request-id>` for request-level routing traces.
- Catalog-driven provider and model metadata.
- Local encrypted provider key storage.
- One-command setup for macOS, Linux, and Windows.
- Integration helpers for popular coding tools.

## Install

Install from npm:

```bash
npm install -g steadyroute
```

Or run from a local checkout:

```bash
npm install
npm run build
npm install -g .
```

## Quick Start

Start the local router:

```bash
steadyroute start
```

Run diagnostics:

```bash
steadyroute doctor
```

List available models:

```bash
steadyroute models
```

Send a request through the default free/no-key route:

```bash
curl -sS -D /tmp/steadyroute-headers.txt \
  http://127.0.0.1:3001/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer steadyroute-local' \
  -d '{
    "model": "steadyroute:auto",
    "messages": [{"role": "user", "content": "Reply with one short sentence."}]
  }'
```

Explain the request:

```bash
REQUEST_ID="$(awk 'tolower($1)=="x-steadyroute-request-id:" {print $2}' /tmp/steadyroute-headers.txt | tr -d '\r')"
steadyroute explain "$REQUEST_ID"
```

Export redacted local diagnostics when sharing evidence:

```bash
steadyroute diagnostics export --output ./steadyroute-diagnostics.json
```

Add an optional provider key only when you want keyed providers:

```bash
printf '%s' "$OPENROUTER_API_KEY" | steadyroute keys add openrouter
steadyroute keys list
steadyroute keys remove openrouter
```

## Local Endpoint

By default, SteadyRoute runs locally and exposes an OpenAI-compatible endpoint:

```text
http://127.0.0.1:3001/v1
```

Use this base URL in compatible tools and SDKs. SteadyRoute v1 is local-only and should not be exposed to the public internet.

## Diagnostics

`steadyroute doctor` is a first-class part of the project. It is intended to tell you what is wrong and what to try next.

Checks include:

- Local installation and port conflicts.
- Provider key presence and validity.
- Provider connectivity and network/proxy issues.
- Catalog freshness.
- Free-tier quota evidence where available.
- Request compatibility with selected models.
- Streaming support.
- Tool-call and JSON schema compatibility.

SteadyRoute records request traces locally so you can inspect how a route was selected, which providers were skipped, which fallbacks were attempted, and what final error classification was returned.
`steadyroute diagnostics export` writes a redacted JSON bundle with doctor output,
provider status, key aliases, recent request metadata, trace ids, attempts, and
usage evidence. Full request and response bodies are summarized by default.

## Default Free Routes

SteadyRoute's default route order starts with no-login/free routes before
keyed providers:

- OpenCode Free (`opencode_free`)
- Kilo anonymous free route (`kilo`)
- Optional keyed providers such as OpenRouter, GitHub Models, Groq, and Gemini

Free-route availability is upstream-controlled and may change without notice.
Do not send sensitive prompts to anonymous/free routes unless you have reviewed
the upstream provider's policy.

## Integrations

SteadyRoute integrations configure local tools to use the local router endpoint. They do not change provider terms, provider limits, or the behavior of upstream services.

The initial focus is on popular coding tools that can use OpenAI-compatible endpoints. Integration helpers should support dry-run and rollback where the target tool allows it.

```bash
steadyroute integrations list
steadyroute integrations apply codex
steadyroute integrations rollback codex
```

## Open Catalog

SteadyRoute uses the [Open Free LLM Catalog](https://github.com/apuslabs/open-free-llm-catalog) for provider and model metadata.

The catalog tracks provider facts such as model IDs, API shapes, known limits, context windows, streaming support, tool-call behavior, schema quirks, retryable errors, deprecations, region notes, and ToS references.

Catalog data is versioned and community-maintained. Unknown or uncertain fields should be marked as unknown, estimated, or community-reported rather than presented as exact.

## Compliance

SteadyRoute is a local routing and diagnostic tool. It does not create free capacity and does not grant permission to use any provider outside that provider's terms.

Please use SteadyRoute responsibly:

- Follow each provider's Terms of Service.
- Do not resell provider access.
- Do not share a local router as a public service.
- Do not use SteadyRoute to bypass provider limits, abuse free tiers, or evade access controls.
- Treat free-tier availability as best-effort and subject to change.

See [docs/compliance.md](docs/compliance.md) for details.

## Security Model

SteadyRoute v1 is local-only.

- The router should bind to localhost.
- Provider keys are stored in a local encrypted file.
- Remote/server mode is not part of the initial scope.
- Do not expose SteadyRoute directly to the public internet.

If you need a public gateway, use infrastructure designed for authentication, tenant isolation, rate limiting, observability, and abuse prevention.

## Roadmap

Near-term:

- Provider adapters for the most useful catalog entries.
- More precise quota evidence and reset handling.
- Better request explanations and failure classifications.
- Integration helpers for popular coding tools.
- Catalog contribution workflow and validation.

Later:

- More routing profiles.
- Richer local dashboard.
- Better network and proxy diagnostics.
- Optional import/export for local configuration.

## Contributing

The easiest way to help is to improve catalog data: provider limits, model IDs, capabilities, deprecations, schema quirks, and ToS references.

For code contributions, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT

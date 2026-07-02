# SteadyRoute MVP Acceptance Protocol

This protocol defines human-run dogfood acceptance for the SteadyRoute MVP. It is
not executable test code and it is not a substitute for later automated tests.

The MVP passes only when real coding agents and real OpenAI-compatible clients
can route through the local SteadyRoute endpoint to real upstream providers, and
SteadyRoute can explain what happened from its local request ledger.

## Scope

The protocol validates observable behavior, not internal implementation:

- local OpenAI-compatible endpoint on `127.0.0.1`
- `/v1/chat/completions`, `/v1/responses`, and `/v1/models`
- `steadyroute doctor`
- `steadyroute explain <request-id>`
- real provider credentials when available
- request ledger, route attempts, fallback decisions, streaming evidence, usage
  and quota evidence

The protocol must not pass by:

- using mock providers
- bypassing SteadyRoute and calling providers directly
- accepting successful client output without a matching SteadyRoute request id
  and ledger entry
- exposing the local router to the public internet
- claiming exact or unlimited free quota unless a provider actually reports it

## Evidence Conventions

For each scenario, capture an evidence bundle under a local directory such as:

```bash
export SR_EVIDENCE_DIR="$PWD/.steadyroute-acceptance/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SR_EVIDENCE_DIR"
```

Each completed scenario should save:

- the exact command or UI steps used
- client stdout/stderr or screenshot where applicable
- the SteadyRoute request id
- `steadyroute explain <request-id>` output
- relevant `steadyroute doctor` output with secrets redacted
- provider names and model ids used
- whether the scenario passed, failed, or was skipped

The request id may appear in a response header such as `x-steadyroute-request-id`,
in a response body field, in CLI output, or in the local server log. The exact
surface can change, but every accepted request must have one stable id that works
with `steadyroute explain <request-id>`.

## Global Prerequisites

- SteadyRoute is installed or runnable from the local checkout.
- `docs/mvp-build-brief.md` has been read and any implementation changes follow
  its provider, routing, trace, and validation constraints.
- The local router is started on a localhost-only bind, normally:

```bash
steadyroute start --host 127.0.0.1 --port 3001
```

- `steadyroute doctor` runs without crashing and reports at least:
  - config path
  - database or ledger path
  - key store path
  - bind address and port
  - catalog version or catalog source
  - provider key presence by provider without printing key values
  - trace or ledger retention setting
- Provider credentials are loaded from local environment variables, provider
  auth commands, or the
  SteadyRoute encrypted key store. Preferred first providers:
  - OpenRouter, usually `OPENROUTER_API_KEY`
  - Gemini, usually `GEMINI_API_KEY` or `GOOGLE_API_KEY`
  - Groq, usually `GROQ_API_KEY`
  - GitHub Models, usually `GITHUB_TOKEN` or `GITHUB_MODELS_TOKEN`
- At least four real providers must be available and healthy for the minimum MVP
  acceptance gate.

Use only accounts and keys the tester is authorized to use. Respect each
provider's Terms of Service and free-tier limits.

## Scenario SR-MVP-P0: Provider Coverage Benchmark

### Purpose

Verify that provider aggregation is treated as an MVP requirement, and that the
provider matrix is aligned with 9router, FreeLLMAPI, OmniRoute, and public
provider documentation.

This scenario runs before SR-MVP-00. It does not require every provider to be
verified, but it requires every provider candidate from the reference projects
to have a visible status and evidence trail.

### Prerequisites

- Public reference material from 9router, FreeLLMAPI, and OmniRoute is
  available for inspection.
- The Open Free LLM Catalog checkout is available locally or through GitHub.

### Setup

Create or update a provider coverage note under `docs/providers/` or
`docs/benchmarks/` that records:

- provider name
- auth method
- base URL or API shape when public
- model ids when known
- free-tier or low-cost availability
- declared limits
- observed limits
- unknown, estimated, or community-reported fields
- streaming support
- tool-call support
- JSON/schema quirks
- retryable error behavior
- quota and rate-limit behavior
- region or network notes
- ToS or documentation links
- SteadyRoute status: `verified`, `implemented-unverified`,
  `blocked-by-auth`, `catalog-only`, `broken`, or `deprecated`
- evidence source

At minimum, assess every provider surfaced by 9router, FreeLLMAPI, and
OmniRoute, plus OpenRouter free models, Gemini free tier, Groq free tier,
GitHub Models, Kilo, Pollinations, LLM7, Cloudflare, Cerebras, NVIDIA, Mistral,
OVH, local providers, and keyless or anonymous providers surfaced by the
reference projects.

### Expected SteadyRoute Behavior

- Provider status is explicit and auditable.
- Unknown fields remain unknown instead of being guessed.
- Broken or blocked providers keep their failure reason.
- Provider coverage work informs routing and catalog metadata.
- Anonymous/keyless routes are clearly distinguished from API-key, OAuth,
  device-flow, browser-login, subscription, trial, local, and low-cost routes.

### Expected Ledger / Explain Evidence

This scenario may not create generation requests. For providers marked
`verified`, later request ids from SR-MVP-04 or other scenarios must be linked
back to the provider matrix.

### Pass Criteria

- The provider matrix exists and includes reference-project-derived provider
  candidates from 9router, FreeLLMAPI, and OmniRoute.
- Each provider has a status and evidence source.
- At least four providers are selected as near-term validation targets.
- At least one anonymous or keyless provider is marked for default install-time
  usability.
- No unavailable provider is silently presented as healthy.

### Fail Criteria

- Provider support is claimed without evidence.
- The matrix ignores provider candidates already explored by the reference
  projects.
- Unknown limits are presented as exact values.
- The implementation validates only one demo provider while claiming broad
  provider aggregation.

### Skip Criteria

Do not skip. Provider coverage is part of MVP acceptance.

## Dogfood Project Selection

Use a real local project, not a one-line toy prompt. The preferred project is an
empty temporary Git repo so the agent must create the application structure
itself:

```bash
export DOGFOOD_PARENT="$(mktemp -d /tmp/steadyroute-dogfood.XXXXXX)"
export DOGFOOD_PROJECT="$DOGFOOD_PARENT/launchboard"
mkdir -p "$DOGFOOD_PROJECT"
git -C "$DOGFOOD_PROJECT" init
git -C "$DOGFOOD_PROJECT" config user.name "SteadyRoute Dogfood"
git -C "$DOGFOOD_PROJECT" config user.email "steadyroute-dogfood@example.local"
```

Dogfood coding task:

> Build LaunchBoard, a small full-stack launch tracker for indie products, from
> an empty disposable project directory. The app must include four pages:
> Dashboard, Products, Product Detail, and Settings. It must include API routes
> for listing products, creating products, reading a product, updating a
> product, and adding launch checklist tasks. It must include a simple data
> layer using SQLite, a JSON file, or in-memory storage. It must include forms,
> filtering, a launch checklist, notes or activity timeline, and a team/settings
> screen. Install dependencies, run at least one real build, test, lint, or type
> check command, fix failures caused by the implementation, and summarize the
> changed files plus final verification command.

Successful completion means the agent created a working multi-page full-stack
application, ran a real verification command such as `npm test`, `pnpm test`,
`npm run build`, `npm run lint`, `tsc`, or an equivalent project command, and
produced a clean summary with the final result.

If the local agent cannot create a project from an empty directory, use a
minimal Vite, Next.js, Remix, Express, Fastify, Hono, or similar starter and
record why the empty-project path was blocked.

## Scenario SR-MVP-00: Baseline Doctor and Model Discovery

### Purpose

Verify that SteadyRoute starts locally, knows where its local state lives, can
see provider credentials without exposing secrets, and can list routeable
models.

### Prerequisites

- SteadyRoute server is running on `127.0.0.1:3001`.
- At least one provider key is present in the environment or key store.

### Setup

```bash
steadyroute doctor | tee "$SR_EVIDENCE_DIR/00-doctor.txt"
steadyroute models | tee "$SR_EVIDENCE_DIR/00-models.txt"
curl -sS http://127.0.0.1:3001/health | tee "$SR_EVIDENCE_DIR/00-health.json"
curl -sS http://127.0.0.1:3001/v1/models | tee "$SR_EVIDENCE_DIR/00-v1-models.json"
```

### Expected SteadyRoute Behavior

- Binds only to localhost unless explicitly configured otherwise.
- Reports config, database, key store, and ledger paths.
- Reports provider key presence and health without printing raw keys.
- Reports catalog source or catalog version.
- Reports which providers/models support chat, responses, streaming, tool calls,
  JSON mode, and known context limits where available.
- Marks unknown catalog/provider fields as unknown rather than inferred as exact.

### Expected Provider Behavior

- Providers with valid credentials should be shown as present and testable.
- Providers without credentials should be shown as absent or skipped.
- Providers that cannot be reached should be classified by cause when possible,
  for example `network_error`, `auth_failed`, or `provider_down`.

### Expected Ledger / Explain Evidence

This scenario may not create model-generation requests. If `doctor` performs
provider probes, those probes should either be excluded from the request ledger
or recorded as diagnostic probes with clear probe labels.

### Pass Criteria

- `doctor`, `/health`, and `/v1/models` complete without crashing.
- Local state paths are visible and secret values are redacted.
- At least two preferred providers are either healthy or have a specific,
  actionable skip reason.

### Fail Criteria

- Server binds to a public interface by default.
- Keys are printed in full.
- Provider state is collapsed into a generic unavailable status.
- Model discovery succeeds only by calling a provider directly outside
  SteadyRoute.

### Skip Criteria

Do not skip. This is a baseline scenario.

## Scenario SR-MVP-01: Chat Completions Through an OpenAI-Compatible Client

### Purpose

Verify that a real OpenAI-compatible client can call
`/v1/chat/completions` through SteadyRoute and receive a provider-backed
response.

### Prerequisites

- Scenario SR-MVP-00 passed.
- At least one real provider credential is healthy.
- Python OpenAI SDK or Node OpenAI SDK is installed. If neither SDK is
  installed, use the curl fallback only as diagnostic evidence and record that
  the OpenAI-compatible client requirement is blocked.

### Setup

Python OpenAI SDK:

```bash
OPENAI_BASE_URL=http://127.0.0.1:3001/v1 \
OPENAI_API_KEY=steadyroute-local \
python - <<'PY' | tee "$SR_EVIDENCE_DIR/01-chat-client.txt"
from openai import OpenAI

client = OpenAI()
response = client.chat.completions.create(
    model="steadyroute:auto",
    messages=[
        {"role": "system", "content": "Answer concisely."},
        {"role": "user", "content": "Say which protocol endpoint this request used and return exactly one short sentence."},
    ],
)
print(response)
PY
```

Curl diagnostic fallback:

```bash
curl -sS -D "$SR_EVIDENCE_DIR/01-chat-headers.txt" \
  http://127.0.0.1:3001/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer steadyroute-local' \
  -d '{
    "model": "steadyroute:auto",
    "messages": [
      {"role": "system", "content": "Answer concisely."},
      {"role": "user", "content": "Say which protocol endpoint this request used and return exactly one short sentence."}
    ]
  }' | tee "$SR_EVIDENCE_DIR/01-chat-body.json"
```

Then run:

```bash
steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/01-explain.txt"
```

### Expected SteadyRoute Behavior

- Receives the request on `/v1/chat/completions`.
- Selects a real provider/model using the active routing policy.
- Adds or exposes a stable SteadyRoute request id.
- Does not require a provider key in the OpenAI-compatible client; upstream
  credentials come from SteadyRoute local state.
- Records the selected provider, selected model, request body, response body or
  safe response excerpt, usage data if available, and final status.

### Expected Provider Behavior

- A healthy provider returns a valid chat completion.
- If the first candidate fails with a fallbackable class, SteadyRoute may attempt
  a later candidate and must record both the failed and successful attempts.

### Expected Ledger / Explain Evidence

`steadyroute explain <request-id>` must show:

- endpoint: `/v1/chat/completions`
- protocol: Chat Completions
- routing policy, for example `auto`
- catalog version or source
- provider/model candidates
- skipped candidates and reasons
- attempted upstream provider/model/key aliases
- final provider/model
- provider status code
- usage fields marked as provider-reported, estimated, observed, or unknown

### Pass Criteria

- Client receives a valid response through SteadyRoute.
- The successful request came from a real OpenAI-compatible SDK or client, not
  only curl.
- The request id can be explained.
- Explain shows at least one real upstream provider attempt.
- No direct provider endpoint appears in the client command.

### Fail Criteria

- The request succeeds but no ledger entry exists.
- The request bypasses SteadyRoute.
- SteadyRoute returns a generic opaque error when a specific provider error was
  available.

### Skip Criteria

- SDK/client execution cannot be skipped for MVP acceptance. If no SDK/client is
  installed, run the curl diagnostic fallback and mark this scenario blocked.
- Provider-specific failures may be skipped only when no real provider
  credential is available; the minimum MVP gate still requires four real
  providers elsewhere.

## Scenario SR-MVP-02: Streaming Chat Completions

### Purpose

Verify that streaming responses produce visible incremental output and that
SteadyRoute records stream metadata plus final assembled output.

### Prerequisites

- Scenario SR-MVP-01 passed.
- At least one healthy provider/model reports or demonstrates streaming support.

### Setup

```bash
curl --no-buffer -sS -D "$SR_EVIDENCE_DIR/02-stream-headers.txt" \
  http://127.0.0.1:3001/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer steadyroute-local' \
  -d '{
    "model": "steadyroute:auto",
    "stream": true,
    "messages": [
      {"role": "user", "content": "Write five short numbered lines about why request tracing matters. Send normal streaming text, not JSON."}
    ]
  }' | tee "$SR_EVIDENCE_DIR/02-stream.sse"
```

Record the request id and run:

```bash
steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/02-explain.txt"
```

### Expected SteadyRoute Behavior

- Streams data to the client incrementally instead of buffering the whole
  provider response.
- Preserves a valid OpenAI-compatible streaming shape for Chat Completions.
- Records streaming start, first chunk time, chunk count, finish reason where
  available, and final assembled text.
- Classifies interruptions as `stream_interrupted`, `network_error`, `timeout`,
  or provider-specific normalized classes instead of returning only a generic
  failure.

### Expected Provider Behavior

- A streaming-capable provider returns multiple deltas or chunks.
- If a provider does not support streaming, SteadyRoute must skip it with a
  streaming capability reason or fail with a precise compatibility class.

### Expected Ledger / Explain Evidence

Explain must show:

- `stream: true`
- provider/model selected for streaming
- chunk count or equivalent stream event count
- first chunk timestamp and final chunk timestamp, or equivalent timing evidence
- final assembled output or safe excerpt
- usage fields if provider reports them after stream completion

### Pass Criteria

- The operator can observe incremental output before stream completion.
- The saved stream file contains multiple stream events or deltas.
- Explain shows stream metadata and final assembled text.

### Fail Criteria

- Output appears only after the upstream request has fully completed.
- The stream is malformed for an OpenAI-compatible client.
- No final assembled output or stream metadata is retained.

### Skip Criteria

Skip only if `doctor` and `models` show no available provider/model with
streaming support. A skip here blocks the minimum MVP acceptance gate because
streaming is required for MVP acceptance.

## Scenario SR-MVP-03: Codex CLI Through `/v1/responses`

### Purpose

Verify real coding-agent integration: Codex CLI sends a `/v1/responses` request
to SteadyRoute, performs a real local coding task, and leaves explainable
request evidence.

### Prerequisites

- Codex CLI is installed.
- `$DOGFOOD_PROJECT` points to the selected dogfood project.
- The dogfood project is disposable.
- At least four real providers are available for the full MVP gate.

### Setup

Run Codex with a custom provider that points at SteadyRoute and explicitly uses
the Responses wire API:

```bash
STEADYROUTE_LOCAL_KEY=steadyroute-local \
codex exec \
  --cd "$DOGFOOD_PROJECT" \
  --sandbox workspace-write \
  --ask-for-approval never \
  -c 'model="steadyroute:auto"' \
  -c 'model_provider="steadyroute"' \
  -c 'model_providers.steadyroute.name="SteadyRoute Local"' \
  -c 'model_providers.steadyroute.base_url="http://127.0.0.1:3001/v1"' \
  -c 'model_providers.steadyroute.wire_api="responses"' \
  -c 'model_providers.steadyroute.env_key="STEADYROUTE_LOCAL_KEY"' \
  'Build LaunchBoard, a small full-stack launch tracker for indie products, in this empty project. Create Dashboard, Products, Product Detail, and Settings pages. Add API routes to list products, create products, read a product, update a product, and add launch checklist tasks. Use SQLite, JSON-file storage, or in-memory storage. Include forms, filtering, a launch checklist, notes or activity timeline, and team/settings state. Install dependencies, run a real build/test/lint/typecheck command, fix failures caused by your implementation, and summarize changed files plus the final verification command.' \
  2>&1 | tee "$SR_EVIDENCE_DIR/03-codex-responses.txt"
```

If the local Codex version uses a different provider config syntax, document the
exact syntax used and keep the essential requirement: Codex must target
`http://127.0.0.1:3001/v1` with Responses API mode.

### Expected SteadyRoute Behavior

- Receives the request on `/v1/responses`, not `/v1/chat/completions`.
- Preserves Codex-compatible response semantics well enough for Codex to inspect
  files, edit files, run shell commands, and produce a final summary.
- Records the request id and all provider attempts for the Codex turn.
- Records whether the request shape included tools, structured output, or other
  Responses-specific fields.
- Records provider capability decisions, including whether the selected
  provider/model supports the observed request shape.

### Expected Provider Behavior

- A selected provider returns a response that Codex can use to continue the
  coding-agent loop.
- If a provider rejects the Responses-shaped request, SteadyRoute either adapts
  the request safely or classifies the rejection, then falls back only when the
  error class is fallbackable.

### Expected Ledger / Explain Evidence

Explain for at least one Codex request id must show:

- endpoint: `/v1/responses`
- protocol: Responses
- client: Codex CLI, if detectable from headers or integration metadata
- request id propagated to response/logs
- route candidates, attempts, skipped reasons, and final provider/model
- request shape summary, including tool or structured-edit-related fields when
  present
- provider raw status and safe error excerpt for failed attempts
- final response status

### Pass Criteria

- Codex modifies the dogfood project in a real way.
- Codex runs a real validation or test command and reports the final result.
- Git diff in `$DOGFOOD_PROJECT` shows a multi-page full-stack application with
  frontend routes, API routes, data handling, and verification scripts or
  commands.
- SteadyRoute explain proves the Codex request used `/v1/responses`.

### Fail Criteria

- Codex used direct OpenAI or another provider endpoint instead of SteadyRoute.
- Codex only chatted and did not inspect or modify files.
- The request reached `/v1/chat/completions` instead of `/v1/responses`.
- No explainable request id exists.

### Skip Criteria

Skip only if Codex CLI is not locally available. A skip here blocks the minimum
MVP acceptance gate because Codex CLI Responses integration is required.

## Scenario SR-MVP-04: Four-Provider End-to-End Provider Matrix

### Purpose

Verify that at least four real providers work through SteadyRoute end to end.

### Prerequisites

- Scenario SR-MVP-01 passed for at least one provider.
- At least four preferred providers are available through anonymous access,
  environment variables, `steadyroute keys add`, or `steadyroute providers auth
  <provider>`.

### Setup

For each available provider among OpenRouter, Gemini, Groq, GitHub Models,
Kilo, Pollinations, LLM7, Cloudflare, Cerebras, NVIDIA, Mistral, OVH, and other
reference-project providers, run one non-streaming request with a provider
allowlist or exact provider route. The exact routing syntax may differ by
implementation, but the request must go through SteadyRoute and must constrain
the candidate set to the provider being validated.

Illustrative shape:

```bash
curl -sS -D "$SR_EVIDENCE_DIR/04-$PROVIDER-headers.txt" \
  http://127.0.0.1:3001/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer steadyroute-local' \
  -H "x-steadyroute-provider-allowlist: $PROVIDER" \
  -d "{
    \"model\": \"steadyroute:auto\",
    \"messages\": [
      {\"role\": \"user\", \"content\": \"Return exactly: provider smoke ok\"}
    ]
  }" | tee "$SR_EVIDENCE_DIR/04-$PROVIDER-body.json"
```

Then explain each request id:

```bash
steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/04-$PROVIDER-explain.txt"
```

### Expected SteadyRoute Behavior

- Honors the provider constraint or exact route.
- Uses the provider's local key from environment or encrypted key store.
- Records candidate filtering, selected provider/model, and any skipped models.
- Does not silently substitute an unconstrained provider.

### Expected Provider Behavior

- Each accepted provider returns a valid model response.
- Provider-specific usage or quota fields are preserved when present.

### Expected Ledger / Explain Evidence

For each provider request, explain must show:

- requested provider constraint
- provider selected
- model selected
- upstream status
- final success or classified provider error
- usage/quota evidence source

### Pass Criteria

- At least four real providers complete a request through SteadyRoute.
- At least two successful providers come from the primary free or low-cost set:
  OpenRouter, Gemini, Groq, GitHub Models, Kilo, Pollinations, LLM7,
  Cloudflare, Cerebras, NVIDIA, or Mistral.
- At least one anonymous or keyless provider works without user login.
- Each has a distinct explainable request id and provider/model evidence.

### Fail Criteria

- Multiple successful responses actually come from the same upstream provider
  while being counted as distinct providers.
- SteadyRoute silently ignores the provider constraint.
- Provider direct calls are used as acceptance evidence.

### Skip Criteria

An individual provider may be skipped if no credential is available, the account
is not authorized, the provider is unavailable in the tester's region, or using
the provider would violate its terms. The minimum MVP gate still requires four
real providers to pass.

## Scenario SR-MVP-05: Optional Additional Coding Client

### Purpose

Dogfood one additional coding-agent or editor client that supports an
OpenAI-compatible endpoint, if available locally.

### Prerequisites

- Scenario SR-MVP-01 passed.
- At least one of Continue, Cline/Roo Code, Aider, OpenCode, or Hermes is
  installed and can be configured to use a local OpenAI-compatible endpoint.
- `$DOGFOOD_PROJECT` is disposable.

### Setup

Use one locally available client. Prefer Aider or OpenCode for command-line
evidence because they are easiest to capture.

Aider example:

```bash
cd "$DOGFOOD_PROJECT"
OPENAI_API_BASE=http://127.0.0.1:3001/v1 \
OPENAI_API_KEY=steadyroute-local \
aider \
  --model openai/steadyroute:auto \
  --yes \
  --message 'Inspect this repo, make one narrow improvement to the validation or documentation task, run the relevant test or validation command, and summarize the diff.' \
  2>&1 | tee "$SR_EVIDENCE_DIR/05-aider.txt"
```

Continue, Cline/Roo Code, OpenCode, or Hermes setup:

- configure the client base URL as `http://127.0.0.1:3001/v1`
- configure the API key as a local placeholder such as `steadyroute-local`
- configure model as `steadyroute:auto` or the SteadyRoute model alias
- run the same dogfood project task
- save the client config excerpt with secrets redacted and save the client
  transcript or screenshots

### Expected SteadyRoute Behavior

- Receives client traffic on `/v1/chat/completions` unless the client explicitly
  supports `/v1/responses`.
- Records client/integration metadata when detectable.
- Records tool-call or structured-edit request shape if the client sends tools.
- Routes to a real provider and records fallback attempts.

### Expected Provider Behavior

- A healthy provider returns a response usable by the client.
- If the client sends unsupported tools or schema fields, SteadyRoute classifies
  the compatibility issue instead of hiding it as generic exhaustion.

### Expected Ledger / Explain Evidence

Explain must show:

- endpoint used
- selected provider/model
- client request shape
- skipped provider/model reasons
- final success or classified failure

### Pass Criteria

- One additional real coding client performs meaningful work in the dogfood
  project through SteadyRoute.
- Request id and explain evidence prove the client used SteadyRoute.

### Fail Criteria

- Client is configured to call a provider directly.
- Client output exists but no SteadyRoute ledger entry exists.
- Client cannot perform even a simple project inspection due to SteadyRoute
  protocol incompatibility and the error is not classified.

### Skip Criteria

Skip if none of the listed clients is installed locally or if installation would
consume material setup time. This scenario is optional and does not block the
minimum MVP acceptance gate.

## Scenario SR-MVP-06: Tool-Call and Request-Shape Conformance

### Purpose

Verify that SteadyRoute records tool-call capability, request shape, and provider
result when a request uses tools or structured agent features.

### Prerequisites

- Scenario SR-MVP-01 passed.
- At least one available provider/model is cataloged as tool-call capable, or
  `doctor` can prove no available provider/model has tool-call support.

### Setup

First, use Scenario SR-MVP-03 as the coding-agent conformance run. Codex is
likely to send a tool-rich or structured Responses-shaped request while editing
and running commands.

If the Codex request does not include provider-visible tool-call or structured
schema fields, run a direct Chat Completions tool-call request through
SteadyRoute:

```bash
curl -sS -D "$SR_EVIDENCE_DIR/06-tools-headers.txt" \
  http://127.0.0.1:3001/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer steadyroute-local' \
  -d '{
    "model": "steadyroute:auto",
    "messages": [
      {"role": "user", "content": "Use the provided tool to report the package name steadyroute-dogfood."}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "report_package",
          "description": "Report the package name found during dogfood.",
          "parameters": {
            "type": "object",
            "properties": {
              "name": {"type": "string"}
            },
            "required": ["name"],
            "additionalProperties": false
          }
        }
      }
    ],
    "tool_choice": "auto"
  }' | tee "$SR_EVIDENCE_DIR/06-tools-body.json"
```

Then explain the request:

```bash
steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/06-explain.txt"
```

### Expected SteadyRoute Behavior

- Detects that the request includes tools or structured request fields.
- Checks provider/model capability before selecting a route when catalog data is
  available.
- Records request shape, normalized tool schema summary, and whether any schema
  repair or rejection occurred.
- Routes to a tool-capable provider when possible.
- If no provider can support the request, returns or records `tool_unsupported`
  or `schema_rejected` rather than generic exhaustion.
- If later direct simulation is needed, it must use the real SteadyRoute HTTP
  endpoint as shown above, not internal mocks.

### Expected Provider Behavior

- A tool-capable provider may return valid `tool_calls` or a normal refusal to
  use the tool.
- A non-tool-capable provider may reject the request. That is acceptable only if
  SteadyRoute classifies the failure and records whether fallback was attempted.

### Expected Ledger / Explain Evidence

Explain must show:

- endpoint and protocol
- `tools_present: true` or equivalent
- tool names or redacted schema summary
- selected provider/model tool-call capability state: known, estimated,
  unknown, community-reported, or unsupported
- provider result: success, tool call returned, schema rejected,
  tool unsupported, or fallback
- final error class if the request fails

### Pass Criteria

- SteadyRoute records tool/request-shape conformance evidence for a real request.
- The request either succeeds through a capable provider or fails with a precise
  compatibility class.

### Fail Criteria

- A tools request is routed blindly to a known unsupported provider without
  explanation.
- Provider schema rejection is collapsed into generic exhaustion.
- Tool-call evidence exists only in an internal unit test or mock path.

### Skip Criteria

Skip provider-success expectations only if `doctor` proves no available real
provider/model supports tool calls. Do not skip the conformance evidence
requirement: SteadyRoute must still record that tools were present and why no
capable provider was used.

## Scenario SR-MVP-07: Controlled Failure, Fallback, and Error Class

### Purpose

Verify that SteadyRoute classifies a controlled failure and records attempted
routes and skipped reasons.

### Prerequisites

- At least one healthy provider credential is available.
- A controlled failing route can be configured without risking account health.

### Setup

Use one of these controlled failures, in this preference order:

1. invalid key alias for a real provider, followed by a valid fallback provider
2. disabled provider in the route policy
3. impossible exact model id
4. intentionally too-small context limit route
5. known provider error returned during normal provider operation

Illustrative invalid-key shape:

```bash
steadyroute keys add openrouter --alias dogfood-invalid --value sk-steadyroute-invalid
```

Then run a request that allows the invalid OpenRouter key first and a valid
second provider second. The exact policy syntax may differ by implementation;
record the exact policy used.

```bash
curl -sS -D "$SR_EVIDENCE_DIR/07-failure-headers.txt" \
  http://127.0.0.1:3001/v1/chat/completions \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer steadyroute-local' \
  -H 'x-steadyroute-route-policy: dogfood-invalid-key-then-fallback' \
  -d '{
    "model": "steadyroute:auto",
    "messages": [
      {"role": "user", "content": "Return exactly: fallback classification ok"}
    ]
  }' | tee "$SR_EVIDENCE_DIR/07-failure-body.json"
```

Explain the request:

```bash
steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/07-explain.txt"
```

### Expected SteadyRoute Behavior

- Attempts or considers the controlled failing route.
- Classifies the failure, for example `auth_failed`, `model_removed`,
  `context_too_large`, `request_invalid`, `rate_limited`,
  `quota_exhausted`, or `provider_down`.
- Marks whether the error is retryable, fallbackable, cooldown-worthy, or needs
  user action.
- Falls back only when the error class is fallbackable.
- Records skipped providers and skipped reasons.

### Expected Provider Behavior

- Invalid credentials should produce a provider auth failure.
- Impossible models should produce provider model-not-found or request-invalid
  behavior.
- Valid fallback providers should respond normally if the failure is fallbackable.

### Expected Ledger / Explain Evidence

Explain must show:

- controlled failure setup
- attempted provider/model/key alias
- provider raw status and safe error excerpt
- normalized error class
- retryable/fallbackable/cooldown/user-action flags
- fallback attempt or reason fallback was not attempted
- final provider/model or final classified error

### Pass Criteria

- The controlled failure appears in the ledger with a precise class.
- A fallbackable failure falls back to a real provider, or a non-fallbackable
  failure stops with a clear explanation.

### Fail Criteria

- Final error says only "all models exhausted" or equivalent.
- The invalid provider/key is not visible in explain.
- SteadyRoute retries a non-fallbackable malformed request across providers
  without explanation.

### Skip Criteria

Skip only if SteadyRoute has no implemented way to configure a controlled
failure yet. This skip blocks minimum MVP acceptance because classified failure
handling is part of the MVP.

## Scenario SR-MVP-08: Quota Evidence Honesty

### Purpose

Verify that SteadyRoute represents provider-reported, observed, estimated, and
unknown usage or quota data honestly.

### Prerequisites

- At least one real provider request has completed.
- Prefer one provider that returns usage or rate-limit headers, if available.

### Setup

Run one short request for each available preferred provider, or reuse request ids
from Scenario SR-MVP-04:

```bash
steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/08-$PROVIDER-explain.txt"
```

Also run:

```bash
steadyroute doctor | tee "$SR_EVIDENCE_DIR/08-doctor.txt"
```

### Expected SteadyRoute Behavior

- Separates usage from quota.
- Labels each value source:
  - provider-reported
  - observed locally
  - estimated locally
  - unknown
  - stale, if retained from older observations
- Preserves provider-reported usage or rate-limit headers when safe.
- Does not invent exact remaining quota when the provider does not return it.
- Does not represent unknown free-tier capacity as unlimited.

### Expected Provider Behavior

- Some providers may return token usage, rate-limit headers, reset times, or
  quota errors.
- Some providers may return no useful quota data. That is acceptable if
  SteadyRoute says unknown.

### Expected Ledger / Explain Evidence

Explain must show usage/quota fields with source labels. Examples:

- `input_tokens.provider_reported`
- `output_tokens.provider_reported`
- `total_tokens.estimated`
- `rate_limit_remaining.provider_reported`
- `daily_quota_remaining.unknown`
- `reset_at.unknown`

The exact field names may differ, but source labeling must be explicit.

### Pass Criteria

- At least two provider explains show usage/quota evidence with honest source
  labels.
- Unknown values are shown as unknown, not zero and not unlimited.

### Fail Criteria

- SteadyRoute reports exact remaining quota without provider evidence.
- Usage data is present but source is unclear.
- Provider quota errors are not connected to the relevant request/provider/key.

### Skip Criteria

Do not skip source-label validation. Exact quota values may be skipped when no
provider reports them.

## Scenario SR-MVP-09: Local-First State and Restart Persistence

### Purpose

Verify that local config, key storage, database/ledger paths, and request
explanations survive server restart.

### Prerequisites

- At least one successful request id from any previous scenario.
- SteadyRoute can be stopped and restarted locally.

### Setup

Capture local state paths:

```bash
steadyroute doctor | tee "$SR_EVIDENCE_DIR/09-doctor-before.txt"
```

Record:

- config path
- database path
- key storage path
- ledger path, if separate
- trace retention setting
- server bind address

Restart the server:

```bash
steadyroute stop
steadyroute start --host 127.0.0.1 --port 3001
```

Then explain a pre-restart request id:

```bash
steadyroute explain "$REQUEST_ID_FROM_BEFORE_RESTART" \
  | tee "$SR_EVIDENCE_DIR/09-explain-after-restart.txt"
steadyroute doctor | tee "$SR_EVIDENCE_DIR/09-doctor-after.txt"
```

If there is no `steadyroute stop` command yet, terminate the local process using
the documented development workflow and record the method used.

### Expected SteadyRoute Behavior

- `doctor` shows stable local paths before and after restart.
- Key store remains available without re-entering keys.
- Request ledger remains available after restart.
- `steadyroute explain <request-id>` works for a pre-restart request.
- Server remains bound to localhost.

### Expected Provider Behavior

No provider call is required after restart unless `doctor` performs health
probes.

### Expected Ledger / Explain Evidence

Explain after restart must return the same request-level evidence:

- endpoint/protocol
- provider/model attempts
- final status
- usage/quota evidence
- error class if applicable

### Pass Criteria

- Pre-restart request id can be explained after restart.
- Local state paths remain consistent.
- Keys are not lost or printed.

### Fail Criteria

- Restart loses request ledger or key state.
- Explain works only while the server process that handled the request is still
  alive.
- Local state location is hidden from `doctor`.

### Skip Criteria

Skip only if process lifecycle commands do not exist yet. This skip blocks
minimum MVP acceptance because local-first persistence is part of the MVP.

## Scenario SR-MVP-10: `/v1/responses` Direct Smoke

### Purpose

Verify that `/v1/responses` works independently of Codex CLI, so failures can be
separated between SteadyRoute and Codex integration.

### Prerequisites

- Scenario SR-MVP-00 passed.
- At least one healthy provider credential exists.

### Setup

```bash
curl -sS -D "$SR_EVIDENCE_DIR/10-responses-headers.txt" \
  http://127.0.0.1:3001/v1/responses \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer steadyroute-local' \
  -d '{
    "model": "steadyroute:auto",
    "input": "Return exactly one sentence explaining that this used the Responses endpoint."
  }' | tee "$SR_EVIDENCE_DIR/10-responses-body.json"
```

Then explain the request:

```bash
steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/10-explain.txt"
```

### Expected SteadyRoute Behavior

- Receives the request on `/v1/responses`.
- Returns a Responses-compatible response shape.
- Records protocol as Responses, distinct from Chat Completions.
- Records any adaptation performed for upstream providers that do not natively
  support Responses.

### Expected Provider Behavior

- A healthy provider returns text output, either through native Responses support
  or a safe SteadyRoute adapter.

### Expected Ledger / Explain Evidence

Explain must show:

- endpoint: `/v1/responses`
- input shape summary
- adapter or native-provider mode
- provider/model attempts
- final output or safe excerpt

### Pass Criteria

- Direct `/v1/responses` request succeeds through SteadyRoute.
- Explain distinguishes it from Chat Completions.

### Fail Criteria

- `/v1/responses` is silently handled as Chat Completions with no evidence.
- Response shape is incompatible with a Responses client.
- No request id exists.

### Skip Criteria

Do not skip. This is required for MVP acceptance.

## Minimum MVP Acceptance Gate

The MVP is accepted only if all required conditions are met:

1. Scenario SR-MVP-P0 passes with a provider matrix informed by 9router,
   FreeLLMAPI, OmniRoute, and public provider docs.
2. Scenario SR-MVP-00 passes.
3. Scenario SR-MVP-01 passes through `/v1/chat/completions`.
4. Scenario SR-MVP-02 passes with visible streaming and stream ledger evidence.
5. Scenario SR-MVP-03 passes with Codex CLI using `/v1/responses`.
6. Scenario SR-MVP-04 passes for at least four real providers, including at
   least two from OpenRouter, Gemini, Groq, GitHub Models, Kilo, Pollinations,
   LLM7, Cloudflare, Cerebras, NVIDIA, or Mistral.
7. Scenario SR-MVP-06 records tool-call or structured request-shape conformance
   evidence for a real SteadyRoute HTTP request.
8. Scenario SR-MVP-07 passes with a classified controlled failure.
9. Scenario SR-MVP-08 proves quota and usage source labels are honest.
10. Scenario SR-MVP-09 proves `doctor` state paths and post-restart explain.
11. Scenario SR-MVP-10 passes for direct `/v1/responses`.
12. Release traceability exists for the completed build: `CHANGELOG.md`,
    versioned package metadata, pushed git commits, git tag, npm publication,
    GitHub release, and linked validation artifacts or summaries.

Optional Scenario SR-MVP-05 should be run when a supported client is already
available locally, but it does not block MVP acceptance.

Any scenario that succeeds only by direct provider calls, mock providers, or
unexplained client success is a failure for MVP acceptance.

## Recommended Dogfood Order

1. Run SR-MVP-P0 to build the provider coverage benchmark.
2. Run SR-MVP-00 to confirm local state, bind address, and provider readiness.
3. Run SR-MVP-04 for provider matrix health and pick four providers for the
   gate.
4. Run SR-MVP-01 for basic Chat Completions.
5. Run SR-MVP-02 for streaming.
6. Run SR-MVP-10 for direct Responses.
7. Prepare `$DOGFOOD_PROJECT`.
8. Run SR-MVP-03 with Codex CLI.
9. Run SR-MVP-06 for tool-call/request-shape conformance.
10. Run SR-MVP-07 for controlled failure and fallback classification.
11. Run SR-MVP-08 for quota evidence honesty.
12. Restart SteadyRoute and run SR-MVP-09.
13. Update `CHANGELOG.md`, package version, release notes, and validation
    artifact summaries.
14. Publish the release to npm, push commits and tags, and create the GitHub
    release.
15. If available, run SR-MVP-05 with one additional coding client.

## Release Traceability

Each published build must leave enough evidence for a maintainer or user to
reconstruct what was shipped and how it was validated.

Required release artifacts:

- `CHANGELOG.md` entry for the version
- `package.json` and lockfile version update
- pushed branch commits
- git tag named `vX.Y.Z`
- npm package publication
- GitHub release with concise release notes
- validation summary that links or names the acceptance evidence directory,
  provider matrix snapshot, request ids used for dogfood, and known gaps

Pass criteria:

- `npm view steadyroute version` or equivalent package metadata shows the
  published version after release.
- The git tag points at the intended commit.
- The GitHub release references the same version as npm and `CHANGELOG.md`.
- Release notes mention real-provider validation status and any blocked
  provider-auth steps.

Fail criteria:

- Code is only committed locally with no pushed branch, tag, npm version, or
  release notes.
- The npm version, git tag, and changelog version disagree.
- Acceptance evidence exists only in local logs with no summarized artifact.

## What Must Be Automated Later

These acceptance checks should become automated after the MVP behavior is stable:

- `/health`, `/v1/models`, `/v1/chat/completions`, and `/v1/responses` smoke
  tests against configured real providers
- request id propagation and `steadyroute explain` schema assertions
- streaming chunk timing and final assembly checks
- provider matrix runs with credential-aware skip reporting
- controlled invalid-key, impossible-model, and context-too-large classification
  checks
- quota evidence source-label assertions
- local state restart persistence checks
- Codex CLI integration smoke with a disposable fixture repo
- at least one OpenAI SDK Chat Completions client smoke
- tool-call request-shape conformance through real HTTP endpoints

Automated tests may use mocks for unit-level adapter behavior later, but the
acceptance gate must continue to include real provider dogfood runs.

## Known Risks and Unresolved Questions

- Provider free-tier availability can change during a run. The protocol should
  record real provider failures rather than hiding them.
- Different providers expose different quota headers and usage fields. The MVP
  should prioritize honest source labels over exact cross-provider parity.
- Codex CLI custom-provider configuration can change over time. The acceptance
  command should be updated to match the locally installed Codex version while
  preserving the `/v1/responses` requirement.
- Some providers may be OpenAI-compatible for chat but not for tool calls,
  streaming, or Responses-shaped requests. SteadyRoute must explain these
  compatibility boundaries.
- The exact SteadyRoute model alias syntax is not fixed by this protocol.
  Whatever syntax is implemented must be visible in `models`, `doctor`, and
  `explain`.
- Full local request tracing stores prompts and responses locally. The MVP must
  make retention and path information visible before users trust it with real
  projects.
- Optional clients such as Continue, Cline/Roo Code, Aider, OpenCode, and Hermes
  have independent configuration quirks. Their failures should be separated from
  SteadyRoute failures using request ledger evidence.

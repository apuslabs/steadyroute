# Changelog

## Unreleased

- Added `steadyroute acceptance todo` to print remaining local evidence capture tasks without running providers.

## 0.1.26 - 2026-07-03

- Added `steadyroute acceptance check` for scriptable local evidence gate checks with non-zero exit status on incomplete audit evidence.
- Changed the manual release workflow to commit and tag releases, then hand npm publishing and GitHub Release creation to the tag-triggered Publish workflow.

## 0.1.25 - 2026-07-03

- Added `steadyroute acceptance list` to print required MVP scenario ids, evidence patterns, audit signals, and review notes.

## 0.1.24 - 2026-07-03

- Added `steadyroute acceptance init` to create local evidence run directories, manifests, and `SR_EVIDENCE_DIR` shell exports.

## 0.1.23 - 2026-07-03

- Fixed release preparation so changelog `Unreleased` stays at the top and existing unreleased notes move into the version entry.

## 0.1.22 - 2026-07-03

- Added `steadyroute acceptance audit` for machine-readable MVP evidence signal review without running providers.

## 0.1.21 - 2026-07-03

- Added per-run acceptance evidence selection with `steadyroute acceptance status --run <name>` and `--latest`.

## 0.1.20 - 2026-07-03

- Added a real package entrypoint at `dist/index.js` and CI/package checks to prevent publishing a tarball with missing `main` or CLI files.

## 0.1.19 - 2026-07-03

- Added request, endpoint, provider, status, and error signals to `steadyroute acceptance status`, and fixed scenario evidence matching so dated directories cannot cross-match unrelated scenario files.

## 0.1.18 - 2026-07-03

- Added `steadyroute acceptance status` to summarize local MVP acceptance evidence coverage without running providers.

## 0.1.17 - 2026-07-03

- Added provider health visibility for active cooldowns and recent failed attempts in `steadyroute doctor` and `steadyroute providers status`.

## 0.1.16 - 2026-07-03

- Added `steadyroute explain <request-id> --json` for stable machine-readable request trace and acceptance assertions.

## 0.1.15 - 2026-07-02

- Added structured-output routing awareness for Chat `response_format` and Responses `text.format`, including JSON-mode candidate preference and `schema_rejected` skips for catalog-unsupported models.

## 0.1.14 - 2026-07-02

- Added model-level allowlist and denylist routing headers with explainable skipped-candidate evidence.

## 0.1.13 - 2026-07-02

- Added router-side context-window preflight so oversized requests skip too-small models before provider calls and report `context_too_large` with ledger/explain evidence.

## 0.1.12 - 2026-07-02

- Added `steadyroute integrations list/apply/rollback codex` to generate and remove a local Codex provider guide without modifying global Codex config.

## 0.1.11 - 2026-07-02

- Normalized provider statuses to the MVP acceptance taxonomy, including `blocked-by-auth` for Groq and Gemini until credentials are provided.

## 0.1.10 - 2026-07-02

- Added `steadyroute config paths` and `steadyroute config show` for explicit local state and configuration inspection.

## 0.1.9 - 2026-07-02

- Added explicit `free-first` route policy ordering for no-login and free-provider routes.
- Made explicit `stable-coding-agent` policy prefer coding-capable free models for chat and Responses requests.

## 0.1.8 - 2026-07-02

- Added `steadyroute diagnostics export` for redacted local evidence bundles.
- Added trace and span identifiers to request ledger records, `explain`, and response headers.

## 0.1.7 - 2026-07-02

- Added `steadyroute keys list` and `steadyroute keys remove` for CLI-only provider key management.
- Kept key listing redacted by showing only provider, alias, and timestamps.

## 0.1.6 - 2026-07-02

- Added GitHub Actions release automation for tagged npm publishes and GitHub Releases.
- Prioritized coding-capable OpenRouter free models for automatic Responses API and tool-bearing agent requests.
- Preserved explicit model, provider allowlist, and route-policy behavior when applying the coding-agent ordering.

## 0.1.5 - 2026-07-02

- Added `steadyroute providers list`, `providers status`, `providers auth`, and `providers test`.
- Made provider smoke tests run through SteadyRoute routing and ledger records instead of direct upstream calls.
- Preserved non-streaming chat tool calls when translating Chat Completions responses to Responses output.
- Added GitHub Models request slimming for Codex tool definitions while preserving the full local request trace.
- Classified terminated provider connections as `network_error` instead of opaque unknown failures.

## 0.1.4 - 2026-07-02

- Published npm build with Responses tool-call fixes and provider validation evidence.

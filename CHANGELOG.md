# Changelog

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

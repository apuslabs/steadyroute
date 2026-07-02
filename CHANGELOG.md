# Changelog

## 0.1.5 - 2026-07-02

- Added `steadyroute providers list`, `providers status`, `providers auth`, and `providers test`.
- Made provider smoke tests run through SteadyRoute routing and ledger records instead of direct upstream calls.
- Preserved non-streaming chat tool calls when translating Chat Completions responses to Responses output.
- Added GitHub Models request slimming for Codex tool definitions while preserving the full local request trace.
- Classified terminated provider connections as `network_error` instead of opaque unknown failures.

## 0.1.4 - 2026-07-02

- Published npm build with Responses tool-call fixes and provider validation evidence.

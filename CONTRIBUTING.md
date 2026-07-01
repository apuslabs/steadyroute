# Contributing to SteadyRoute

SteadyRoute is experimental. Contributions should make the router easier to run, easier to diagnose, or safer to use.

## Good First Contributions

- Improve provider or model metadata in the Open Free LLM Catalog.
- Add clearer diagnostic messages.
- Add reproduction cases for provider failures.
- Improve integration docs for local tools.
- Add tests for error classification and fallback behavior.

## Contribution Guidelines

- Keep user-facing claims best-effort and precise.
- Do not add claims of unlimited or guaranteed free capacity.
- Do not add features intended to bypass provider limits or access controls.
- Keep local-only security assumptions explicit.
- Prefer transparent `unknown` states over guessed quota or capability data.

## Development Expectations

Code contributions should include tests for the behavior they change. Provider adapters should describe capability assumptions and known quirks.

## Compliance

Contributions must respect provider Terms of Service. Do not submit code, docs, or catalog data that encourages resale, public sharing of local access, or limit evasion.

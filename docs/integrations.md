# Integrations

SteadyRoute integrations configure local tools to use the local OpenAI-compatible endpoint.

Integrations should:

- Support dry-run where possible.
- Avoid overwriting unrelated user configuration.
- Provide rollback where possible.
- Clearly show the target config file or setting.
- Keep routing decisions inside SteadyRoute, not in the integration layer.

Example commands:

```bash
steadyroute integrations list
steadyroute integrations apply codex
steadyroute integrations rollback codex
```

Initial integrations should focus on popular coding tools that support OpenAI-compatible endpoints.

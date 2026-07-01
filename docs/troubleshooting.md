# Troubleshooting

Start with:

```bash
steadyroute doctor
```

For a specific request:

```bash
steadyroute explain <request-id>
```

## Common Failure Classes

- Missing or invalid provider key.
- Provider rate limit or daily quota.
- Provider outage or network failure.
- Removed or renamed model.
- Context length too large.
- Unsupported tool calls.
- Unsupported JSON schema fields.
- Streaming incompatibility.
- Local port conflict.

SteadyRoute should classify these cases separately when possible so users can take the right next step.

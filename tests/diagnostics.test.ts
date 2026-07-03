import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportDiagnostics } from "../src/diagnostics.js";
import { createRequest, finalizeRequest, openDb, recordAttempt } from "../src/db.js";
import { unknownUsage } from "../src/usage.js";

describe("diagnostics export", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("exports a redacted local diagnostics bundle with trace metadata", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-diagnostics-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();
    createRequest(db, {
      requestId: "req_diag",
      traceId: "trace_123",
      spanId: "span_456",
      endpoint: "/v1/chat/completions",
      protocol: "chat_completions",
      method: "POST",
      client: "test",
      modelRequested: "steadyroute:auto",
      routePolicy: "auto",
      providerAllowlist: [],
      providerDenylist: [],
      requestBody: { model: "steadyroute:auto", messages: [{ role: "user", content: "secret prompt" }] },
      catalogSource: "test",
      candidates: [{ provider: "kilo", model: "kilo-auto/free" }],
      skips: [],
      traceFullBodies: true
    });
    recordAttempt(db, {
      requestId: "req_diag",
      attemptIndex: 1,
      provider: "kilo",
      model: "kilo-auto/free",
      keyAlias: "anonymous",
      status: "success",
      errorClass: null,
      behavior: null,
      upstreamStatus: 200,
      requestBody: { model: "kilo-auto/free", messages: [{ role: "user", content: "secret prompt" }] },
      responseBody: { choices: [{ message: { content: "secret response" } }] },
      responseHeaders: {},
      safeErrorExcerpt: "",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      latencyMs: 1,
      usage: unknownUsage(),
      fallbackDecision: null
    });
    finalizeRequest(db, {
      requestId: "req_diag",
      finalStatus: "success",
      httpStatus: 200,
      finalProvider: "kilo",
      finalModel: "kilo-auto/free",
      finalErrorClass: null,
      responseBody: { choices: [{ message: { content: "secret response" } }] },
      usage: unknownUsage(),
      streamMetadata: null,
      fallbackDecisions: []
    });

    const output = await exportDiagnostics(db, { outputPath: path.join(home, "diag.json"), limit: 5 });
    const text = fs.readFileSync(output, "utf8");
    const bundle = JSON.parse(text) as { requests: Array<{ request: Record<string, unknown>; attempts: Array<Record<string, unknown>> }> };

    expect(text).not.toContain("secret prompt");
    expect(text).not.toContain("secret response");
    expect(bundle.requests[0]?.request.trace_id).toBe("trace_123");
    expect(bundle.requests[0]?.request.span_id).toBe("span_456");
    expect(bundle.requests[0]?.request.request_body_json).toMatchObject({ redacted: true, model: "steadyroute:auto", messages_count: 1 });
    expect(bundle.requests[0]?.attempts[0]?.response_body_json).toMatchObject({ redacted: true, choices_count: 1 });
  });
});

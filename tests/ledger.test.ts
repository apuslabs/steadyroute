import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createRequest, finalizeRequest, openDb, recordAttempt } from "../src/db.js";
import { explainRequest, explainRequestJson } from "../src/explain.js";
import { unknownUsage } from "../src/usage.js";

describe("SQLite ledger", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("persists attempts and explains after reopening the database", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();
    createRequest(db, {
      requestId: "req_test",
      endpoint: "/v1/chat/completions",
      protocol: "chat_completions",
      method: "POST",
      client: "test",
      modelRequested: "steadyroute:auto",
      routePolicy: "auto",
      providerAllowlist: [],
      providerDenylist: [],
      requestBody: { model: "steadyroute:auto", messages: [{ role: "user", content: "hi" }] },
      catalogSource: "test",
      candidates: [{ provider: "github_models", model: "gpt-4o-mini" }],
      skips: [],
      traceFullBodies: true
    });
    recordAttempt(db, {
      requestId: "req_test",
      attemptIndex: 1,
      provider: "github_models",
      model: "gpt-4o-mini",
      keyAlias: "gh-cli",
      status: "success",
      errorClass: null,
      behavior: null,
      upstreamStatus: 200,
      requestBody: { ok: true },
      responseBody: { choices: [{ message: { content: "hi" } }] },
      responseHeaders: {},
      safeErrorExcerpt: "",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      latencyMs: 1,
      usage: unknownUsage(),
      fallbackDecision: null
    });
    finalizeRequest(db, {
      requestId: "req_test",
      finalStatus: "success",
      httpStatus: 200,
      finalProvider: "github_models",
      finalModel: "gpt-4o-mini",
      finalErrorClass: null,
      responseBody: { ok: true },
      usage: unknownUsage(),
      streamMetadata: null,
      fallbackDecisions: []
    });
    db.close();

    const reopened = openDb();
    const explanation = explainRequest(reopened, "req_test");
    expect(explanation).toContain("Trace:");
    expect(explanation).toContain("github_models / gpt-4o-mini");
    expect(explanation).toContain("Attempts:");

    const json = explainRequestJson(reopened, "req_test");
    expect(json).toMatchObject({
      found: true,
      request_id: "req_test",
      endpoint: "/v1/chat/completions",
      protocol: "chat_completions",
      final_provider: "github_models",
      final_model: "gpt-4o-mini",
      request_shape: {
        stream: false,
        tools_present: false,
        tool_names: [],
        structured_output: "none"
      },
      trace_full_bodies: true
    });
    expect(json.trace_id).toMatch(/^[0-9a-f]{32}$/);
    expect(json.span_id).toMatch(/^[0-9a-f]{16}$/);
    expect(json.attempts).toHaveLength(1);
    expect(json.attempts[0]).toMatchObject({ provider: "github_models", model: "gpt-4o-mini", status: "success", upstream_status: 200 });
  });

  it("explains tool request shape and response tool calls", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-tool-ledger-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();
    createRequest(db, {
      requestId: "req_tools",
      endpoint: "/v1/chat/completions",
      protocol: "chat_completions",
      method: "POST",
      client: "curl",
      modelRequested: "steadyroute:auto",
      routePolicy: "auto",
      providerAllowlist: ["github_models"],
      providerDenylist: [],
      requestBody: {
        model: "steadyroute:auto",
        messages: [{ role: "user", content: "use tool" }],
        response_format: { type: "json_object" },
        tools: [{ type: "function", function: { name: "report_package", parameters: { type: "object" } } }]
      },
      catalogSource: "test",
      candidates: [{ provider: "github_models", model: "gpt-4o-mini", capabilities: { toolCalls: "known" } }],
      skips: [],
      traceFullBodies: true
    });
    recordAttempt(db, {
      requestId: "req_tools",
      attemptIndex: 1,
      provider: "github_models",
      model: "gpt-4o-mini",
      keyAlias: "gh-cli",
      status: "success",
      errorClass: null,
      behavior: null,
      upstreamStatus: 200,
      requestBody: { ok: true },
      responseBody: {
        choices: [{ message: { tool_calls: [{ type: "function", function: { name: "report_package", arguments: "{}" } }] } }]
      },
      responseHeaders: {},
      safeErrorExcerpt: "",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      latencyMs: 1,
      usage: unknownUsage(),
      fallbackDecision: null
    });
    finalizeRequest(db, {
      requestId: "req_tools",
      finalStatus: "success",
      httpStatus: 200,
      finalProvider: "github_models",
      finalModel: "gpt-4o-mini",
      finalErrorClass: null,
      responseBody: {
        choices: [{ message: { tool_calls: [{ type: "function", function: { name: "report_package", arguments: "{}" } }] } }]
      },
      usage: unknownUsage(),
      streamMetadata: null,
      fallbackDecisions: []
    });

    const explanation = explainRequest(db, "req_tools");
    expect(explanation).toContain("tools_present: true");
    expect(explanation).toContain("structured_output: json_object");
    expect(explanation).toContain("tool_names: report_package");
    expect(explanation).toContain("response_tool_calls: report_package");
    expect(explanation).toContain("tool_calls=known");

    const json = explainRequestJson(db, "req_tools");
    expect(json.request_shape).toEqual({
      stream: false,
      tools_present: true,
      tool_names: ["report_package"],
      structured_output: "json_object"
    });
    expect(json.candidates).toContainEqual(expect.objectContaining({
      provider: "github_models",
      model: "gpt-4o-mini",
      capabilities: { toolCalls: "known" }
    }));
  });

  it("returns a stable JSON not-found shape", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-explain-json-missing-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();

    expect(explainRequestJson(db, "req_missing")).toEqual({
      found: false,
      request_id: "req_missing",
      trace_id: null,
      span_id: null,
      status: null,
      http_status: null,
      endpoint: null,
      protocol: null,
      client: null,
      requested_model: null,
      route_policy: null,
      catalog_source: null,
      final_provider: null,
      final_model: null,
      final_error_class: null,
      error_behavior: null,
      request_shape: { stream: false, tools_present: false, tool_names: [], structured_output: "none" },
      candidates: [],
      skips: [],
      attempts: [],
      usage: {},
      quota: {},
      stream_metadata: {},
      trace_full_bodies: false
    });
  });
});

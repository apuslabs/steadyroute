import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addProviderKey, openDb } from "../src/db.js";
import { explainRequest } from "../src/explain.js";
import { routeRequest } from "../src/router.js";

describe("router fallback", () => {
  const homes: string[] = [];
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("records fallbackable provider failures before a successful fallback", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-router-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    vi.stubEnv("GITHUB_MODELS_TOKEN", "ghp-test");
    const db = openDb();
    addProviderKey(db, "openrouter", "dogfood-invalid", "sk-or-v1-invalid");
    addProviderKey(db, "openrouter", "default", "sk-or-v1-valid");
    let calls = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls += 1;
      const textUrl = String(url);
      const auth = init?.headers && typeof init.headers === "object" && !Array.isArray(init.headers) ? (init.headers as Record<string, string>).authorization : "";
      if (textUrl.includes("openrouter.ai") && auth === "Bearer sk-or-v1-invalid") {
        return new Response(JSON.stringify({ error: { message: "User not found.", code: 401 } }), { status: 401 });
      }
      return new Response(JSON.stringify({
        id: "chatcmpl_test",
        model: "gpt-4o-mini",
        choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const result = await routeRequest({
      requestId: "req_fallback",
      db,
      endpoint: "/v1/chat/completions",
      method: "POST",
      body: { model: "steadyroute:auto", messages: [{ role: "user", content: "hi" }] },
      headers: {
        "x-steadyroute-provider-allowlist": "openrouter,github_models",
        "x-steadyroute-route-policy": "dogfood-invalid-key-then-fallback"
      },
      traceFullBodies: true,
      providerOrder: ["github_models", "openrouter"]
    });

    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("x-steadyroute-trace-id")).toMatch(/^[0-9a-f]{32}$/);
    expect(calls).toBeGreaterThanOrEqual(2);
    const explanation = explainRequest(db, "req_fallback");
    expect(explanation).toContain("Trace:");
    expect(explanation).toContain("openrouter/openrouter/free key=dogfood-invalid");
    expect(explanation).toContain("auth_failed");
    expect(explanation).toContain("fallbackable: trying next candidate");
    expect(explanation).toContain("openrouter / openrouter/free");
  });

  it("uses a no-key free provider before keyed providers by default", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-router-free-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("GITHUB_MODELS_TOKEN", "");
    const db = openDb();
    let observedAuth = "";
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      observedAuth = init?.headers && typeof init.headers === "object" && !Array.isArray(init.headers) ? String((init.headers as Record<string, string>).authorization ?? "") : "";
      return new Response(JSON.stringify({
        id: "chatcmpl_free",
        model: "deepseek-v4-flash",
        choices: [{ message: { role: "assistant", content: "free ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const result = await routeRequest({
      requestId: "req_free_default",
      db,
      endpoint: "/v1/chat/completions",
      method: "POST",
      body: { model: "steadyroute:auto", messages: [{ role: "user", content: "hi" }] },
      headers: {},
      traceFullBodies: true,
      providerOrder: ["opencode_free", "kilo", "openrouter", "github_models"]
    });

    expect(result.response.status).toBe(200);
    expect(observedAuth).toBe("Bearer public");
    const explanation = explainRequest(db, "req_free_default");
    expect(explanation).toContain("Final provider/model: opencode_free / big-pickle");
    expect(explanation).toContain("key=anonymous");
  });

  it("prefers coding-capable OpenRouter models for automatic Responses agent requests", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-router-coding-policy-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
    vi.stubEnv("GITHUB_MODELS_TOKEN", "ghp-test");
    const db = openDb();
    let upstreamModel = "";
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const upstreamBody = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
      upstreamModel = upstreamBody.model ?? "";
      return new Response(JSON.stringify({
        id: "chatcmpl_coding",
        model: upstreamModel,
        choices: [{ message: { role: "assistant", content: "coding ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const result = await routeRequest({
      requestId: "req_coding_policy",
      db,
      endpoint: "/v1/responses",
      method: "POST",
      body: { model: "steadyroute:auto", input: "inspect files and run tests" },
      headers: {},
      traceFullBodies: true,
      providerOrder: ["opencode_free", "kilo", "openrouter", "github_models"]
    });

    expect(result.response.status).toBe(200);
    expect(upstreamModel).toBe("qwen/qwen3-coder:free");
    const explanation = explainRequest(db, "req_coding_policy");
    expect(explanation).toContain("Final provider/model: openrouter / qwen/qwen3-coder:free");
    expect(explanation).toContain("openrouter/qwen/qwen3-coder:free");
  });

  it("classifies an allowlisted missing provider key as auth_failed", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-router-missing-key-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    vi.stubEnv("GROQ_API_KEY", "");
    const db = openDb();

    const result = await routeRequest({
      requestId: "req_missing_key",
      db,
      endpoint: "/v1/chat/completions",
      method: "POST",
      body: { model: "steadyroute:auto", messages: [{ role: "user", content: "hi" }] },
      headers: { "x-steadyroute-provider-allowlist": "groq" },
      traceFullBodies: true,
      providerOrder: ["groq"]
    });

    expect(result.response.status).toBe(401);
    const body = await result.response.json() as { error?: { code?: string } };
    expect(body.error?.code).toBe("auth_failed");
    const explanation = explainRequest(db, "req_missing_key");
    expect(explanation).toContain("Final error class: auth_failed");
    expect(explanation).toContain("Create or provide a Groq API key");
  });

  it("slims Codex tool definitions for GitHub Models without changing the local request trace", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-router-github-slim-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    vi.stubEnv("GITHUB_MODELS_TOKEN", "ghp-test");
    const db = openDb();
    let upstreamToolNames: string[] = [];
    globalThis.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const upstreamBody = JSON.parse(String(init?.body ?? "{}")) as { tools?: Array<{ function?: { name?: string } }> };
      upstreamToolNames = upstreamBody.tools?.map((tool) => tool.function?.name ?? "") ?? [];
      return new Response(JSON.stringify({
        id: "chatcmpl_tool",
        model: "gpt-4o-mini",
        choices: [{
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_1",
              type: "function",
              function: { name: "exec_command", arguments: "{\"cmd\":\"pwd\"}" }
            }]
          },
          finish_reason: "tool_calls"
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const tools = [
      { type: "function", name: "exec_command", parameters: { type: "object", properties: { cmd: { type: "string" } } } },
      { type: "function", name: "write_stdin", parameters: { type: "object", properties: { session_id: { type: "number" }, chars: { type: "string" } } } },
      { type: "function", name: "spawn_agent", parameters: { type: "object", properties: { prompt: { type: "string" } } } },
      { type: "function", name: "update_plan", parameters: { type: "object", properties: { plan: { type: "array" } } } }
    ];

    const result = await routeRequest({
      requestId: "req_github_slim",
      db,
      endpoint: "/v1/responses",
      method: "POST",
      body: { model: "steadyroute:github_models/gpt-4o-mini", input: "run pwd", stream: false, tools },
      headers: {},
      traceFullBodies: true,
      providerOrder: ["github_models"]
    });

    expect(result.response.status).toBe(200);
    const body = await result.response.json() as { output?: Array<Record<string, unknown>> };
    expect(body.output).toContainEqual(expect.objectContaining({ type: "function_call", name: "exec_command" }));
    expect(upstreamToolNames).toEqual(["exec_command", "write_stdin"]);
    const explanation = explainRequest(db, "req_github_slim");
    expect(explanation).toContain("tool_names: exec_command, write_stdin, spawn_agent, update_plan");
    expect(explanation).toContain("response_tool_calls: exec_command");
  });

  it("closes a stream after a terminal finish chunk without waiting for upstream done", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-router-terminal-stream-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();
    globalThis.fetch = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode([
            "data: {\"id\":\"chatcmpl_terminal\",\"choices\":[{\"delta\":{\"content\":\"done\"},\"finish_reason\":null}]}",
            "",
            "data: {\"id\":\"chatcmpl_terminal\",\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}]}",
            "",
            ""
          ].join("\n")));
        }
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch;

    const result = await routeRequest({
      requestId: "req_terminal_stream",
      db,
      endpoint: "/v1/responses",
      method: "POST",
      body: { model: "steadyroute:kilo/openrouter/free", input: "hi", stream: true },
      headers: {},
      traceFullBodies: true,
      providerOrder: ["kilo"]
    });

    expect(result.response.status).toBe(200);
    const responseText = await Promise.race([
      result.response.text(),
      new Promise<string>((_resolve, reject) => setTimeout(() => reject(new Error("stream did not close after terminal chunk")), 500))
    ]);
    expect(responseText).toContain("response.completed");
    await result.metadataDone;
    const explanation = explainRequest(db, "req_terminal_stream");
    expect(explanation).toContain("Status: success (HTTP 200)");
    expect(explanation).toContain("Final provider/model: kilo / openrouter/free");
    expect(explanation).toContain("- finish_reason: stop");
    expect(explanation).not.toContain("Final error class: stream_interrupted");
  });

  it("keeps classifying streams without a terminal finish as interrupted", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-router-interrupted-stream-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();
    globalThis.fetch = vi.fn(async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(
            "data: {\"id\":\"chatcmpl_interrupted\",\"choices\":[{\"delta\":{\"content\":\"partial\"},\"finish_reason\":null}]}\n\n"
          ));
          controller.error(new Error("upstream ended mid-stream"));
        }
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }) as unknown as typeof fetch;

    const result = await routeRequest({
      requestId: "req_interrupted_stream",
      db,
      endpoint: "/v1/responses",
      method: "POST",
      body: { model: "steadyroute:kilo/openrouter/free", input: "hi", stream: true },
      headers: {},
      traceFullBodies: true,
      providerOrder: ["kilo"]
    });

    expect(result.response.status).toBe(200);
    await expect(result.response.text()).rejects.toThrow("upstream ended mid-stream");
    await result.metadataDone;
    const explanation = explainRequest(db, "req_interrupted_stream");
    expect(explanation).toContain("Status: failed (HTTP 502)");
    expect(explanation).toContain("Final error class: stream_interrupted");
  });
});

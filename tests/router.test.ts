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
    expect(calls).toBeGreaterThanOrEqual(2);
    const explanation = explainRequest(db, "req_fallback");
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
});

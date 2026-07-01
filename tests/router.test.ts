import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db.js";
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
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-v1-invalid");
    const db = openDb();
    let calls = 0;
    globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
      calls += 1;
      const textUrl = String(url);
      if (textUrl.includes("openrouter.ai")) {
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
    expect(explanation).toContain("auth_failed");
    expect(explanation).toContain("fallbackable: trying next candidate");
    expect(explanation).toContain("github_models / gpt-4o-mini");
  });
});

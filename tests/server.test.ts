import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addProviderKey, openDb } from "../src/db.js";
import { buildServer } from "../src/server.js";

describe("server model discovery", () => {
  const homes: string[] = [];
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("marks models key-present when a provider key is stored in the encrypted key store", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-server-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const db = openDb();
    addProviderKey(db, "openrouter", "default", "sk-test");
    const app = buildServer({ db, host: "127.0.0.1", port: 3111 });

    const response = await app.inject({ method: "GET", url: "/v1/models" });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: Array<{ id: string; steadyroute?: { provider: string; provider_status: string; evidence: string[]; key_present: boolean } }>;
    };
    const openrouterModels = body.data.filter((model) => model.steadyroute?.provider === "openrouter");
    expect(openrouterModels.length).toBeGreaterThan(0);
    expect(openrouterModels.every((model) => model.steadyroute?.key_present === true)).toBe(true);
    expect(openrouterModels.every((model) => model.steadyroute?.provider_status === "verified")).toBe(true);
    expect(openrouterModels[0]?.steadyroute?.evidence.length).toBeGreaterThan(0);

    await app.close();
    db.close();
  });

  it("returns CLI-safe request ids on routed generation responses", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-server-id-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("GITHUB_MODELS_TOKEN", "");

    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      id: "chatcmpl_test",
      model: "big-pickle",
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

    const db = openDb();
    const app = buildServer({ db, host: "127.0.0.1", port: 3111 });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      headers: { "content-type": "application/json" },
      payload: { model: "steadyroute:auto", messages: [{ role: "user", content: "hi" }] }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-steadyroute-request-id"]).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{17}$/);

    await app.close();
    db.close();
  });
});

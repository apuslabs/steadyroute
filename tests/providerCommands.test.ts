import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb, setCooldown } from "../src/db.js";
import { explainRequest } from "../src/explain.js";
import { formatProviderList, formatProviderStatus, providerAuth, providerListRows, providerStatusRows, runProviderSmokeTest } from "../src/providerCommands.js";

describe("provider commands", () => {
  const homes: string[] = [];
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("lists catalog providers with auth modes", () => {
    const rows = providerListRows();
    expect(rows.some((row) => row.id === "kilo" && row.keyless)).toBe(true);
    expect(rows.some((row) => row.id === "openrouter" && row.auth_method === "api_key")).toBe(true);
    expect(rows.find((row) => row.id === "groq")?.status).toBe("blocked-by-auth");
    expect(rows.find((row) => row.id === "gemini")?.status).toBe("blocked-by-auth");
    expect(rows.every((row) => ["verified", "implemented-unverified", "blocked-by-auth", "catalog-only", "broken", "deprecated"].includes(row.status))).toBe(true);
    expect(formatProviderList(rows)).toContain("openrouter\tstatus=verified\tauth=api_key");
  });

  it("shows human auth setup without printing secret values", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-provider-auth-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    vi.stubEnv("OPENROUTER_API_KEY", "sk-secret-never-print");
    const db = openDb();

    const output = providerAuth(db, "openrouter");

    expect(output).toContain("auth available");
    expect(output).not.toContain("sk-secret-never-print");
  });

  it("reports provider status rows from doctor state", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-provider-status-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    vi.stubEnv("GROQ_API_KEY", "");
    const db = openDb();

    const rows = await providerStatusRows(db, "groq", false);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.provider).toBe("groq");
    expect(rows[0]?.key_present).toBe(false);
    expect(String(rows[0]?.human_action)).toContain("Groq API key");
  });

  it("includes active cooldown counts in formatted provider status", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-provider-cooldown-status-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();
    setCooldown(db, "kilo", "openrouter/free", "anonymous", "provider_down", "upstream 503", 60_000);

    const rows = await providerStatusRows(db, "kilo", false);
    const formatted = formatProviderStatus(rows);

    expect(rows[0]?.health).toMatchObject({ active_cooldowns: [expect.objectContaining({ model: "openrouter/free", error_class: "provider_down" })] });
    expect(formatted).toContain("active_cooldowns=1");
  });

  it("runs provider smoke tests through routeRequest and records explainable ledger evidence", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-provider-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      id: "chatcmpl_provider_test",
      model: "kilo-auto/free",
      choices: [{ message: { role: "assistant", content: "provider smoke ok" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 3, total_tokens: 7 }
    }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

    const result = await runProviderSmokeTest(db, "kilo", { model: "kilo-auto/free" });

    expect(result.ok).toBe(true);
    expect(result.request_id).toMatch(/^provtest_/);
    const explanation = explainRequest(db, String(result.request_id));
    expect(explanation).toContain("Endpoint: /v1/chat/completions");
    expect(explanation).toContain("Final provider/model: kilo / kilo-auto/free");
    expect(explanation).toContain("Client: steadyroute-cli/providers-test");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addProviderKey, openDb } from "../src/db.js";
import { buildServer } from "../src/server.js";

describe("server model discovery", () => {
  const homes: string[] = [];

  afterEach(() => {
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
      data: Array<{ id: string; steadyroute?: { provider: string; key_present: boolean } }>;
    };
    const openrouterModels = body.data.filter((model) => model.steadyroute?.provider === "openrouter");
    expect(openrouterModels.length).toBeGreaterThan(0);
    expect(openrouterModels.every((model) => model.steadyroute?.key_present === true)).toBe(true);

    await app.close();
    db.close();
  });
});

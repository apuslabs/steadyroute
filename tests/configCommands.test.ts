import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { configPathRows, configShowRows, formatConfigPaths, formatConfigShow } from "../src/configCommands.js";

describe("config commands", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("reports local state paths explicitly", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-config-paths-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;

    const rows = configPathRows();
    const formatted = formatConfigPaths(rows);

    expect(rows.home).toBe(home);
    expect(rows.config).toBe(path.join(home, "config.json"));
    expect(rows.ledger).toBe(path.join(home, "steadyroute.sqlite"));
    expect(rows.key_store).toBe(path.join(home, "steadyroute.sqlite"));
    expect(formatted).toContain(`config: ${path.join(home, "config.json")}`);
    expect(formatted).toContain(`key_store: ${path.join(home, "steadyroute.sqlite")}`);
  });

  it("shows safe local configuration fields", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-config-show-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;

    const rows = configShowRows();
    const formatted = formatConfigShow(rows);

    expect(rows.host).toBe("127.0.0.1");
    expect(rows.port).toBe(3001);
    expect(rows.trace_full_bodies).toBe(true);
    expect(rows.provider_order).toContain("opencode_free");
    expect(formatted).toContain("host: 127.0.0.1");
    expect(formatted).toContain("provider_order: opencode_free");
  });
});

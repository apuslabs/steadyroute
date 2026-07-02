import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyIntegration, formatIntegrationApply, formatIntegrationList, integrationListRows, rollbackIntegration } from "../src/integrationCommands.js";

describe("integration commands", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("lists Codex as a manual custom-provider integration", () => {
    const rows = integrationListRows();
    expect(rows).toContainEqual(expect.objectContaining({ id: "codex", status: "available" }));
    expect(formatIntegrationList(rows)).toContain("codex\tstatus=available");
  });

  it("generates and rolls back a Codex integration artifact without touching global Codex config", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-integrations-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;

    const dryRun = applyIntegration("codex", { dryRun: true });
    const artifactPath = path.join(home, "integrations", "codex.md");
    expect(dryRun.path).toBe(artifactPath);
    expect(dryRun.wrote_file).toBe(false);
    expect(fs.existsSync(artifactPath)).toBe(false);

    const applied = applyIntegration("codex");
    expect(applied.path).toBe(artifactPath);
    expect(applied.wrote_file).toBe(true);
    expect(fs.readFileSync(artifactPath, "utf8")).toContain('model_providers.steadyroute.wire_api="responses"');
    expect(formatIntegrationApply(applied)).toContain("STEADYROUTE_LOCAL_KEY=steadyroute-local");

    const rolledBack = rollbackIntegration("codex");
    expect(rolledBack.removed).toBe(true);
    expect(fs.existsSync(artifactPath)).toBe(false);
  });
});

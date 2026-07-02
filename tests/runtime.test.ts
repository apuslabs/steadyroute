import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readRuntimeStatus, removeRuntimeState, writeRuntimeState } from "../src/runtime.js";

describe("runtime state", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("detects stale metadata for a dead process and removes it", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-runtime-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;

    writeRuntimeState({ pid: 99999999, host: "127.0.0.1", port: 3001, local_only: true });
    const status = readRuntimeStatus();

    if (status.status !== "stale") throw new Error(`expected stale runtime status, got ${status.status}`);
    expect(status.reason).toContain("not running");

    removeRuntimeState();
    expect(readRuntimeStatus().status).toBe("not_running");
  });
});

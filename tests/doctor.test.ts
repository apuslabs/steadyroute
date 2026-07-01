import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDoctorReport, formatDoctor } from "../src/doctor.js";
import { openDb } from "../src/db.js";
import { writeRuntimeState } from "../src/runtime.js";

describe("doctor", () => {
  const homes: string[] = [];

  afterEach(() => {
    for (const home of homes.splice(0)) fs.rmSync(home, { recursive: true, force: true });
    delete process.env.STEADYROUTE_HOME;
  });

  it("reports the active runtime bind separately from configured defaults", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-doctor-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;

    writeRuntimeState({ pid: process.pid, host: "127.0.0.1", port: 3011, local_only: true });
    const report = await buildDoctorReport(openDb(), false);
    const formatted = formatDoctor(report);

    expect(report.server.configured.port).toBe(3001);
    expect(report.server.runtime.status).toBe("running");
    expect(report.server.runtime.state?.port).toBe(3011);
    expect(formatted).toContain("Server config: 127.0.0.1:3001 local_only=true");
    expect(formatted).toContain(`Running server: 127.0.0.1:3011 pid=${process.pid} local_only=true`);
  });
});

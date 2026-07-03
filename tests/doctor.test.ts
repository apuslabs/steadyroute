import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDoctorReport, formatDoctor } from "../src/doctor.js";
import { createRequest, finalizeRequest, openDb, recordAttempt, setCooldown } from "../src/db.js";
import { writeRuntimeState } from "../src/runtime.js";
import { unknownUsage } from "../src/usage.js";

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
    expect(formatted).toContain("- kilo: status=verified");
    expect(formatted).toContain("evidence:");
  });

  it("surfaces active cooldowns and recent provider failures", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-doctor-health-test-"));
    homes.push(home);
    process.env.STEADYROUTE_HOME = home;
    const db = openDb();
    setCooldown(db, "openrouter", "openrouter/free", "default", "rate_limited", "provider returned 429", 60_000);
    createRequest(db, {
      requestId: "req_failed_health",
      endpoint: "/v1/chat/completions",
      protocol: "chat_completions",
      method: "POST",
      client: "test",
      modelRequested: "steadyroute:auto",
      routePolicy: "auto",
      providerAllowlist: ["openrouter"],
      providerDenylist: [],
      requestBody: { model: "steadyroute:auto", messages: [{ role: "user", content: "hi" }] },
      catalogSource: "test",
      candidates: [{ provider: "openrouter", model: "openrouter/free" }],
      skips: [],
      traceFullBodies: true
    });
    recordAttempt(db, {
      requestId: "req_failed_health",
      attemptIndex: 1,
      provider: "openrouter",
      model: "openrouter/free",
      keyAlias: "default",
      status: "failed",
      errorClass: "rate_limited",
      behavior: { cooldown: true },
      upstreamStatus: 429,
      requestBody: { ok: true },
      responseBody: { error: "rate limit" },
      responseHeaders: {},
      safeErrorExcerpt: "rate limit",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      latencyMs: 2,
      usage: unknownUsage(),
      fallbackDecision: "fallbackable: trying next candidate if available"
    });
    finalizeRequest(db, {
      requestId: "req_failed_health",
      finalStatus: "failed",
      httpStatus: 429,
      finalProvider: null,
      finalModel: null,
      finalErrorClass: "rate_limited",
      responseBody: { error: { code: "rate_limited" } },
      usage: unknownUsage(),
      streamMetadata: null,
      fallbackDecisions: []
    });

    const report = await buildDoctorReport(db, false);
    const openrouter = report.providers.find((provider) => provider.provider === "openrouter") as { health?: { active_cooldowns?: unknown[]; recent_failures?: unknown[] } } | undefined;
    expect(openrouter?.health?.active_cooldowns).toHaveLength(1);
    expect(openrouter?.health?.recent_failures).toHaveLength(1);
    const formatted = formatDoctor(report);
    expect(formatted).toContain("active_cooldowns:");
    expect(formatted).toContain("recent_failures:");
    expect(formatted).toContain("req_failed_health openrouter/free error=rate_limited upstream=429");
  });
});

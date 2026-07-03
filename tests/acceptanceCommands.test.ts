import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAcceptanceStatus, formatAcceptanceStatus } from "../src/acceptanceCommands.js";

describe("acceptance commands", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  });

  it("reports missing evidence without treating missing files as a pass", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-empty-test-"));
    roots.push(root);

    const report = buildAcceptanceStatus({ root });
    const formatted = formatAcceptanceStatus(report);

    expect(report.selection).toMatchObject({ mode: "aggregate", run: null, evidence_root: root });
    expect(report.summary.gate_status).toBe("evidence-incomplete");
    expect(report.summary.missing_required).toContain("SR-MVP-00");
    expect(formatted).toContain("Mode: aggregate");
    expect(formatted).toContain("Gate status: evidence-incomplete");
    expect(formatted).toContain("note: This command only checks local evidence file presence.");
  });

  it("summarizes evidence files by acceptance scenario", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-status-test-"));
    roots.push(root);
    writeEvidence(root, "run-1/00-doctor.txt");
    writeEvidence(root, "run-1/00-models.txt");
    writeEvidence(root, "run-1/00-health.json");
    writeEvidence(root, "run-1/00-v1-models.json");
    writeEvidence(root, "run-1/01-chat-client.txt");
    writeEvidence(root, "run-1/01-explain.txt");

    const report = buildAcceptanceStatus({ root });

    expect(report.scenarios.find((scenario) => scenario.id === "SR-MVP-00")).toMatchObject({ status: "evidence-present" });
    expect(report.scenarios.find((scenario) => scenario.id === "SR-MVP-01")).toMatchObject({ status: "evidence-present" });
    expect(report.summary.missing_required).not.toContain("SR-MVP-00");
    expect(report.summary.missing_required).toContain("SR-MVP-02");
    expect(report.scenarios.find((scenario) => scenario.id === "SR-MVP-01")?.signals.request_ids).toEqual([]);
  });

  it("matches scenario evidence by filename instead of dated parent directory names", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-basename-test-"));
    roots.push(root);
    writeEvidence(root, "20260701-run/01-chat-client.txt");
    writeEvidence(root, "20260701-run/02-explain.txt", [
      "SteadyRoute request req_wrong_scenario",
      "Status: success (HTTP 200)",
      "Endpoint: /v1/chat/completions",
      "Final provider/model: openrouter / openrouter/free"
    ].join("\n"));

    const report = buildAcceptanceStatus({ root });
    const chat = report.scenarios.find((scenario) => scenario.id === "SR-MVP-01");
    const stream = report.scenarios.find((scenario) => scenario.id === "SR-MVP-02");

    expect(chat).toMatchObject({ status: "missing" });
    expect(chat?.signals.request_ids).toEqual([]);
    expect(stream?.signals.request_ids).toEqual(["req_wrong_scenario"]);
  });

  it("extracts explain and doctor signals without marking the gate passed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-signals-test-"));
    roots.push(root);
    writeEvidence(root, "run-1/00-doctor.txt", [
      "SteadyRoute doctor",
      `Config path: ${path.join(root, "config.json")}`,
      `DB path: ${path.join(root, "steadyroute.sqlite")}`,
      `Ledger path: ${path.join(root, "steadyroute.sqlite")}`,
      "Server config: 127.0.0.1:3001 local_only=true"
    ].join("\n"));
    writeEvidence(root, "run-1/00-models.txt");
    writeEvidence(root, "run-1/00-health.json");
    writeEvidence(root, "run-1/00-v1-models.json");
    writeEvidence(root, "run-1/10-responses-body.json");
    writeEvidence(root, "run-1/10-responses-explain.txt", [
      "SteadyRoute request req_responses_signal",
      "Status: success (HTTP 200)",
      "Endpoint: /v1/responses",
      "Final provider/model: openrouter / openrouter/free"
    ].join("\n"));

    const report = buildAcceptanceStatus({ root });
    const baseline = report.scenarios.find((scenario) => scenario.id === "SR-MVP-00");
    const responses = report.scenarios.find((scenario) => scenario.id === "SR-MVP-10");
    const formatted = formatAcceptanceStatus(report);

    expect(baseline?.signals).toMatchObject({ doctor_files: 1, doctor_local_paths: true });
    expect(responses?.signals).toMatchObject({
      explain_files: 1,
      request_ids: ["req_responses_signal"],
      endpoints: ["/v1/responses"],
      providers: ["openrouter"]
    });
    expect(formatted).toContain("signals: explain_files=1 request_ids=1 endpoints=/v1/responses providers=openrouter");
    expect(report.summary.gate_status).toBe("evidence-incomplete");
  });

  it("can restrict evidence status to a named run directory", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-run-test-"));
    roots.push(root);
    writeEvidence(root, "run-a/00-doctor.txt");
    writeEvidence(root, "run-a/00-models.txt");
    writeEvidence(root, "run-a/00-health.json");
    writeEvidence(root, "run-a/00-v1-models.json");
    writeEvidence(root, "run-b/01-chat-client.txt");
    writeEvidence(root, "run-b/01-explain.txt", [
      "SteadyRoute request req_run_b",
      "Status: success (HTTP 200)",
      "Endpoint: /v1/chat/completions",
      "Final provider/model: kilo / openai/gpt-oss-120b"
    ].join("\n"));

    const aggregate = buildAcceptanceStatus({ root });
    const runA = buildAcceptanceStatus({ root, run: "run-a" });
    const runB = buildAcceptanceStatus({ root, run: "run-b" });
    const formatted = formatAcceptanceStatus(runB);

    expect(aggregate.scenarios.find((scenario) => scenario.id === "SR-MVP-00")).toMatchObject({ status: "evidence-present" });
    expect(aggregate.scenarios.find((scenario) => scenario.id === "SR-MVP-01")).toMatchObject({ status: "evidence-present" });
    expect(runA.selection).toMatchObject({ mode: "run", run: "run-a", evidence_root: path.join(root, "run-a") });
    expect(runA.selection.available_runs).toEqual(["run-a", "run-b"]);
    expect(runA.scenarios.find((scenario) => scenario.id === "SR-MVP-00")).toMatchObject({ status: "evidence-present" });
    expect(runA.scenarios.find((scenario) => scenario.id === "SR-MVP-01")).toMatchObject({ status: "missing" });
    expect(runB.scenarios.find((scenario) => scenario.id === "SR-MVP-00")).toMatchObject({ status: "missing" });
    expect(runB.scenarios.find((scenario) => scenario.id === "SR-MVP-01")).toMatchObject({ status: "evidence-present" });
    expect(runB.scenarios.find((scenario) => scenario.id === "SR-MVP-01")?.signals.request_ids).toEqual(["req_run_b"]);
    expect(formatted).toContain("Mode: run");
    expect(formatted).toContain("Run: run-b");
  });

  it("can select the latest run directory by modification time", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-latest-test-"));
    roots.push(root);
    writeEvidence(root, "old-run/00-doctor.txt");
    writeEvidence(root, "new-run/01-chat-client.txt");
    writeEvidence(root, "new-run/01-explain.txt");
    const oldTime = new Date("2026-07-02T00:00:00.000Z");
    const newTime = new Date("2026-07-03T00:00:00.000Z");
    fs.utimesSync(path.join(root, "old-run"), oldTime, oldTime);
    fs.utimesSync(path.join(root, "new-run"), newTime, newTime);

    const report = buildAcceptanceStatus({ root, latest: true });

    expect(report.selection).toMatchObject({ mode: "latest", run: "new-run", evidence_root: path.join(root, "new-run") });
    expect(report.selection.available_runs).toEqual(["new-run", "old-run"]);
    expect(report.scenarios.find((scenario) => scenario.id === "SR-MVP-00")).toMatchObject({ status: "missing" });
    expect(report.scenarios.find((scenario) => scenario.id === "SR-MVP-01")).toMatchObject({ status: "evidence-present" });
  });

  it("does not scan outside the evidence root for invalid run names", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-invalid-run-test-"));
    roots.push(root);
    writeEvidence(root, "safe-run/00-doctor.txt");

    const report = buildAcceptanceStatus({ root, run: "../safe-run" });

    expect(report.selection).toMatchObject({
      mode: "run",
      run: "../safe-run",
      evidence_root: path.join(root, "__invalid_run__")
    });
    expect(report.notes).toContain("Ignored invalid run name: ../safe-run");
    expect(report.scenarios.find((scenario) => scenario.id === "SR-MVP-00")).toMatchObject({ status: "missing" });
  });
});

function writeEvidence(root: string, relativePath: string, contents = "evidence\n"): void {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
}

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

    expect(report.summary.gate_status).toBe("evidence-incomplete");
    expect(report.summary.missing_required).toContain("SR-MVP-00");
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
  });
});

function writeEvidence(root: string, relativePath: string): void {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, "evidence\n");
}

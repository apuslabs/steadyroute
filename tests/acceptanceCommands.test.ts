import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acceptanceScenarioListRows, buildAcceptanceAudit, buildAcceptanceCheck, buildAcceptanceIds, buildAcceptanceStatus, buildAcceptanceTodo, formatAcceptanceAudit, formatAcceptanceCheck, formatAcceptanceIds, formatAcceptanceInit, formatAcceptanceScenarioList, formatAcceptanceStatus, formatAcceptanceTodo, initAcceptanceRun } from "../src/acceptanceCommands.js";

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

  it("lists acceptance scenarios with evidence patterns and audit signals", () => {
    const rows = acceptanceScenarioListRows();
    const formatted = formatAcceptanceScenarioList(rows);
    const responses = rows.find((row) => row.id === "SR-MVP-10");

    expect(rows).toHaveLength(11);
    expect(rows.every((row) => row.required)).toBe(true);
    expect(responses).toMatchObject({
      required: true,
      required_signals: ["request_id", "endpoint:/v1/responses", "provider", "success_status"]
    });
    expect(responses?.evidence_patterns.some((pattern) => pattern.includes("10-responses-body"))).toBe(true);
    expect(formatted).toContain("SteadyRoute MVP acceptance scenarios");
    expect(formatted).toContain("Required: 11/11");
    expect(formatted).toContain("SR-MVP-10: required");
  });

  it("initializes a local evidence run manifest without proving acceptance", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-init-test-"));
    roots.push(root);

    const result = initAcceptanceRun({ root, run: "manual-smoke" });
    const manifest = JSON.parse(fs.readFileSync(result.manifest_path, "utf8")) as {
      run: string;
      required_scenarios: string[];
      optional_scenarios: string[];
      notes: string[];
    };
    const formatted = formatAcceptanceInit(result);

    expect(result).toMatchObject({
      root,
      run: "manual-smoke",
      evidence_dir: path.join(root, "manual-smoke"),
      manifest_path: path.join(root, "manual-smoke", "manifest.json"),
      capture_script_path: path.join(root, "manual-smoke", "capture.sh"),
      commands_path: path.join(root, "manual-smoke", "commands.md"),
      created: true
    });
    expect(manifest.run).toBe("manual-smoke");
    expect(manifest.required_scenarios).toContain("SR-MVP-10");
    expect(manifest.optional_scenarios).toEqual(["SR-MVP-05"]);
    expect(manifest.notes.join(" ")).toContain("does not prove acceptance");
    expect(fs.statSync(result.capture_script_path).mode & 0o111).toBeGreaterThan(0);
    expect(fs.readFileSync(result.capture_script_path, "utf8")).toContain("capture_baseline()");
    expect(fs.readFileSync(result.capture_script_path, "utf8")).toContain("This script is a capture template.");
    expect(fs.readFileSync(result.capture_script_path, "utf8")).toContain("list_request_ids()");
    expect(fs.readFileSync(result.capture_script_path, "utf8")).toContain("capture_explains()");
    expect(fs.readFileSync(result.commands_path, "utf8")).toContain("SR-MVP-03 Codex Responses Dogfood");
    expect(fs.readFileSync(result.commands_path, "utf8")).toContain("steadyroute acceptance ids --run manual-smoke");
    expect(fs.readFileSync(result.commands_path, "utf8")).toContain("steadyroute acceptance check --run manual-smoke");
    expect(formatted).toContain("Run: manual-smoke");
    expect(formatted).toContain("Capture script:");
    expect(formatted).toContain("Command notes:");
    expect(formatAcceptanceInit(result, { printEnv: true })).toBe([
      `export SR_EVIDENCE_DIR='${path.join(root, "manual-smoke")}'`,
      `export SR_CAPTURE_SCRIPT='${path.join(root, "manual-smoke", "capture.sh")}'`
    ].join("\n"));
  });

  it("protects existing evidence runs unless force is set", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-init-force-test-"));
    roots.push(root);
    initAcceptanceRun({ root, run: "existing-run" });

    expect(() => initAcceptanceRun({ root, run: "existing-run" })).toThrow(/already exists/);

    const result = initAcceptanceRun({ root, run: "existing-run", force: true });
    expect(result.created).toBe(false);
  });

  it("rejects unsafe evidence run names", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-init-invalid-test-"));
    roots.push(root);

    expect(() => initAcceptanceRun({ root, run: "../outside" })).toThrow(/Invalid acceptance run name/);
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
      providers: ["openrouter"],
      usage_or_quota: false
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

  it("audits required signals without treating file presence as final acceptance", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-audit-test-"));
    roots.push(root);
    writeEvidence(root, "run-1/01-chat-client.txt", "x-steadyroute-request-id: req_chat\n");
    writeEvidence(root, "run-1/01-explain.txt", [
      "SteadyRoute request req_chat",
      "Status: success (HTTP 200)",
      "Endpoint: /v1/chat/completions",
      "Final provider/model: openrouter / openrouter/free",
      "",
      "Attempts:",
      "- #1 openrouter/openrouter/free key=default status=success upstream=200 latency=800ms",
      "  usage: input=4 (provider) output=6 (provider) total=10 (provider)"
    ].join("\n"));
    writeEvidence(root, "run-1/02-stream.sse", "data: first\n\ndata: second\n\n");
    writeEvidence(root, "run-1/02-explain.txt", [
      "SteadyRoute request req_stream",
      "Status: success (HTTP 200)",
      "Endpoint: /v1/chat/completions",
      "Final provider/model: kilo / openrouter/free",
      "",
      "Stream metadata:",
      "- stream: true",
      "- chunk_count: 3",
      "- first_chunk_at: 2026-07-03T00:00:00.000Z",
      "- final_chunk_at: 2026-07-03T00:00:01.000Z",
      "- done_seen: true",
      "- finish_reason: stop"
    ].join("\n"));
    writeEvidence(root, "run-1/06-tool-body.json", "{}");
    writeEvidence(root, "run-1/06-tool-explain.txt", [
      "SteadyRoute request req_tool",
      "Status: success (HTTP 200)",
      "Endpoint: /v1/responses",
      "Final provider/model: openrouter / qwen/qwen3-coder:free",
      "",
      "Request shape:",
      "- stream: false",
      "- tools_present: true",
      "- structured_output: none",
      "- tool_names: report_package"
    ].join("\n"));

    const report = buildAcceptanceAudit({ root, run: "run-1" });
    const formatted = formatAcceptanceAudit(report);
    const chat = report.scenarios.find((scenario) => scenario.id === "SR-MVP-01");
    const stream = report.scenarios.find((scenario) => scenario.id === "SR-MVP-02");
    const tool = report.scenarios.find((scenario) => scenario.id === "SR-MVP-06");
    const baseline = report.scenarios.find((scenario) => scenario.id === "SR-MVP-00");

    expect(chat).toMatchObject({ audit_status: "pass-ready", missing_signals: [] });
    expect(stream).toMatchObject({ audit_status: "pass-ready", missing_signals: [] });
    expect(stream?.signals.stream_metadata).toBe(true);
    expect(tool).toMatchObject({ audit_status: "pass-ready", missing_signals: [] });
    expect(tool?.signals.tool_or_structured_shape).toBe(true);
    expect(baseline).toMatchObject({ audit_status: "missing-evidence" });
    expect(report.summary.audit_status).toBe("audit-incomplete");
    expect(report.summary.review_required).toContain("SR-MVP-00");
    expect(formatted).toContain("SR-MVP-01: pass-ready");
    expect(formatted).toContain("SR-MVP-00: missing-evidence");
    expect(formatted).toContain("note: Audit status is based on machine-readable evidence signals only;");
  });

  it("builds a failing scriptable acceptance check while required scenarios need review", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-check-fail-test-"));
    roots.push(root);
    writeEvidence(root, "run-1/01-chat-client.txt");
    writeEvidence(root, "run-1/01-explain.txt", [
      "SteadyRoute request req_chat",
      "Status: success (HTTP 200)",
      "Endpoint: /v1/chat/completions",
      "Final provider/model: openrouter / openrouter/free"
    ].join("\n"));

    const result = buildAcceptanceCheck({ root, run: "run-1" });
    const formatted = formatAcceptanceCheck(result);

    expect(result.ok).toBe(false);
    expect(result.audit_status).toBe("audit-incomplete");
    expect(result.review_required).toContain("SR-MVP-00");
    expect(formatted).toContain("SteadyRoute acceptance check failed");
  });

  it("prints actionable todo items for missing acceptance evidence without running providers", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-todo-test-"));
    roots.push(root);
    writeEvidence(root, "run-1/00-doctor.txt", doctorText(root));
    writeEvidence(root, "run-1/00-models.txt");
    writeEvidence(root, "run-1/00-health.json");
    writeEvidence(root, "run-1/00-v1-models.json");
    writeEvidence(root, "run-1/01-chat-client.txt", "x-steadyroute-request-id: req_chat\n");
    writeEvidence(root, "run-1/01-explain.txt", [
      "SteadyRoute request req_chat",
      "Status: success (HTTP 200)",
      "Endpoint: /v1/chat/completions",
      "Final provider/model: openrouter / openrouter/free"
    ].join("\n"));

    const report = buildAcceptanceTodo({ root, run: "run-1" });
    const formatted = formatAcceptanceTodo(report);

    expect(report.summary).toMatchObject({
      required_total: 11,
      pass_ready_required: 3,
      todo_required: 8,
      audit_status: "audit-incomplete"
    });
    expect(report.items.map((item) => item.id)).not.toContain("SR-MVP-P0");
    expect(report.items.map((item) => item.id)).not.toContain("SR-MVP-00");
    expect(report.items.map((item) => item.id)).not.toContain("SR-MVP-01");
    expect(report.items.find((item) => item.id === "SR-MVP-03")?.next_steps.join(" ")).toContain("Run Codex CLI");
    expect(report.items.find((item) => item.id === "SR-MVP-04")?.next_steps.join(" ")).toContain("at least four distinct real providers");
    expect(formatted).toContain("SteadyRoute acceptance todo");
    expect(formatted).toContain("Todo required scenarios: 8");
    expect(formatted).toContain("SR-MVP-03: missing-evidence");
    expect(formatted).toContain("next: Run Codex CLI against SteadyRoute with wire_api=responses");
    expect(formatted).toContain("note: This todo list is generated from local evidence files only.");
  });

  it("extracts request ids from local evidence files and prints explain commands", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-ids-test-"));
    roots.push(root);
    writeEvidence(root, "run-1/01-chat-headers.txt", [
      "HTTP/1.1 200 OK",
      "x-steadyroute-request-id: req_chat_header"
    ].join("\n"));
    writeEvidence(root, "run-1/01-chat-body.json", JSON.stringify({
      steadyroute_request_id: "req_chat_body",
      steadyroute: { request_id: "req_chat_nested" }
    }));
    writeEvidence(root, "run-1/03-codex-responses.txt", [
      "Using SteadyRoute",
      "request_id=req_codex_log"
    ].join("\n"));
    writeEvidence(root, "run-1/03-explain.txt", [
      "SteadyRoute request req_codex_explain",
      "Status: success (HTTP 200)"
    ].join("\n"));
    writeEvidence(root, "run-1/notes.txt", "x-steadyroute-request-id: req_ignored\n");

    const report = buildAcceptanceIds({ root, run: "run-1" });
    const formatted = formatAcceptanceIds(report);
    const chat = report.scenarios.find((scenario) => scenario.id === "SR-MVP-01");
    const codex = report.scenarios.find((scenario) => scenario.id === "SR-MVP-03");

    expect(report.summary).toMatchObject({
      request_ids_total: 5,
      scenarios_with_ids: 2
    });
    expect(chat?.request_ids.map((hit) => hit.request_id)).toEqual(["req_chat_body", "req_chat_header", "req_chat_nested"]);
    expect(codex?.request_ids.map((hit) => hit.request_id)).toEqual(["req_codex_explain", "req_codex_log"]);
    expect(chat?.request_ids[0].explain_command).toContain("steadyroute explain 'req_chat_body'");
    expect(chat?.request_ids[0].explain_command).toContain("$SR_EVIDENCE_DIR/01-explain-req_chat_body.txt");
    expect(formatted).toContain("SteadyRoute acceptance request ids");
    expect(formatted).toContain("SR-MVP-01: 3 request ids");
    expect(formatted).toContain("explain: steadyroute explain 'req_chat_body'");
    expect(formatted).toContain("note: This command only extracts request ids from local evidence files.");
  });

  it("builds a passing scriptable acceptance check when every required scenario is pass-ready", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-check-pass-test-"));
    roots.push(root);
    writeEvidence(root, "run-1/00-doctor.txt", doctorText(root));
    writeEvidence(root, "run-1/00-models.txt");
    writeEvidence(root, "run-1/00-health.json");
    writeEvidence(root, "run-1/00-v1-models.json");
    writeScenarioExplain(root, "01", "chat", "req_chat", "/v1/chat/completions", "openrouter");
    writeEvidence(root, "run-1/02-stream.sse", "data: one\n\ndata: two\n\n");
    writeScenarioExplain(root, "02", "stream", "req_stream", "/v1/chat/completions", "kilo", ["Stream metadata:", "- stream: true", "- chunk_count: 2"]);
    writeScenarioExplain(root, "03", "codex-responses", "req_codex", "/v1/responses", "openrouter");
    writeScenarioExplain(root, "03", "explain", "req_codex", "/v1/responses", "openrouter");
    for (const provider of ["openrouter", "kilo", "groq", "gemini"]) {
      writeScenarioExplain(root, "04", provider, `req_${provider}`, "/v1/chat/completions", provider);
    }
    writeEvidence(root, "run-1/06-tool-body.json", "{}");
    writeScenarioExplain(root, "06", "tool", "req_tool", "/v1/responses", "openrouter", [
      "Request shape:",
      "- stream: false",
      "- tools_present: true",
      "- structured_output: none",
      "- tool_names: report_package"
    ]);
    writeEvidence(root, "run-1/07-failure-explain.txt", [
      "SteadyRoute request req_failure",
      "Status: failed (HTTP 401)",
      "Endpoint: /v1/chat/completions",
      "Final provider/model: openrouter / openrouter/free",
      "Final error class: auth_failed",
      "  error: auth_failed"
    ].join("\n"));
    writeEvidence(root, "run-1/08-doctor.txt", doctorText(root));
    writeScenarioExplain(root, "08", "openrouter", "req_usage", "/v1/chat/completions", "openrouter", [
      "Attempts:",
      "- #1 openrouter/openrouter/free key=default status=success upstream=200 latency=20ms",
      "  usage: input=1 (provider) output=1 (provider) total=2 (provider)"
    ]);
    writeEvidence(root, "run-1/09-after-restart.txt", "restart ok\n");
    writeEvidence(root, "run-1/09-doctor-after.txt", doctorText(root));
    writeScenarioExplain(root, "09", "after", "req_after", "/v1/chat/completions", "openrouter");
    writeEvidence(root, "run-1/10-responses-body.json", "{}");
    writeScenarioExplain(root, "10", "responses", "req_responses", "/v1/responses", "openrouter");

    const result = buildAcceptanceCheck({ root, run: "run-1" });
    const formatted = formatAcceptanceCheck(result);
    const todo = buildAcceptanceTodo({ root, run: "run-1" });

    expect(result.ok).toBe(true);
    expect(result.audit_status).toBe("ready-for-human-review");
    expect(result.pass_ready_required).toBe(11);
    expect(result.review_required).toEqual([]);
    expect(formatted).toContain("SteadyRoute acceptance check passed");
    expect(todo.items).toEqual([]);
    expect(formatAcceptanceTodo(todo)).toContain("No local evidence TODOs remain.");
  });

  it("requires four distinct provider signals for the provider matrix scenario", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "steadyroute-acceptance-provider-audit-test-"));
    roots.push(root);
    for (const provider of ["openrouter", "kilo", "groq"]) {
      writeEvidence(root, `run-1/04-${provider}-explain.txt`, [
        `SteadyRoute request req_${provider}`,
        "Status: success (HTTP 200)",
        "Endpoint: /v1/chat/completions",
        `Final provider/model: ${provider} / model`
      ].join("\n"));
    }

    const threeProviderReport = buildAcceptanceAudit({ root, run: "run-1" });
    expect(threeProviderReport.scenarios.find((scenario) => scenario.id === "SR-MVP-04")).toMatchObject({
      audit_status: "review-required",
      missing_signals: ["four_providers"]
    });

    writeEvidence(root, "run-1/04-gemini-explain.txt", [
      "SteadyRoute request req_gemini",
      "Status: success (HTTP 200)",
      "Endpoint: /v1/chat/completions",
      "Final provider/model: gemini / gemini-2.5-flash"
    ].join("\n"));

    const fourProviderReport = buildAcceptanceAudit({ root, run: "run-1" });
    expect(fourProviderReport.scenarios.find((scenario) => scenario.id === "SR-MVP-04")).toMatchObject({
      audit_status: "pass-ready",
      missing_signals: []
    });
  });
});

function writeEvidence(root: string, relativePath: string, contents = "evidence\n"): void {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents);
}

function doctorText(root: string): string {
  return [
    "SteadyRoute doctor",
    `Config path: ${path.join(root, "config.json")}`,
    `DB path: ${path.join(root, "steadyroute.sqlite")}`,
    `Ledger path: ${path.join(root, "steadyroute.sqlite")}`,
    "Server config: 127.0.0.1:3001 local_only=true"
  ].join("\n");
}

function writeScenarioExplain(root: string, prefix: string, name: string, requestId: string, endpoint: string, provider: string, extra: string[] = []): void {
  writeEvidence(root, `run-1/${prefix}-${name}-explain.txt`, [
    `SteadyRoute request ${requestId}`,
    "Status: success (HTTP 200)",
    `Endpoint: ${endpoint}`,
    `Final provider/model: ${provider} / model`,
    ...extra
  ].join("\n"));
}

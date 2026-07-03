import fs from "node:fs";
import path from "node:path";

export interface AcceptanceInitOptions {
  root?: string;
  run?: string;
  force?: boolean;
}

export interface AcceptanceInitResult {
  root: string;
  run: string;
  evidence_dir: string;
  manifest_path: string;
  capture_script_path: string;
  commands_path: string;
  created: boolean;
  manifest: AcceptanceRunManifest;
  shell_exports: string[];
}

export interface AcceptanceRunManifest {
  schema_version: 1;
  run: string;
  created_at: string;
  evidence_dir: string;
  required_scenarios: string[];
  optional_scenarios: string[];
  notes: string[];
}

export interface AcceptanceScenarioListRow {
  id: string;
  required: boolean;
  evidence_patterns: string[];
  required_signals: string[];
  review_notes: string[];
}

export interface AcceptanceStatusOptions {
  root?: string;
  run?: string;
  latest?: boolean;
}

export interface AcceptanceScenarioStatus {
  id: string;
  required: boolean;
  status: "evidence-present" | "missing";
  evidence_files: string[];
  missing_patterns: string[];
  signals: AcceptanceEvidenceSignals;
}

export interface AcceptanceScenarioAudit extends AcceptanceScenarioStatus {
  audit_status: "pass-ready" | "review-required" | "missing-evidence";
  required_signals: string[];
  missing_signals: string[];
  review_notes: string[];
}

export interface AcceptanceEvidenceSignals {
  explain_files: number;
  request_ids: string[];
  endpoints: string[];
  providers: string[];
  final_statuses: string[];
  error_classes: string[];
  doctor_files: number;
  doctor_local_paths: boolean;
  stream_metadata: boolean;
  usage_or_quota: boolean;
  tool_or_structured_shape: boolean;
}

export interface AcceptanceStatusReport {
  root: string;
  selection: AcceptanceEvidenceSelection;
  generated_at: string;
  summary: {
    required_total: number;
    required_with_evidence: number;
    missing_required: string[];
    gate_status: "evidence-incomplete" | "evidence-present-unverified";
  };
  scenarios: AcceptanceScenarioStatus[];
  notes: string[];
}

export interface AcceptanceAuditReport extends Omit<AcceptanceStatusReport, "scenarios" | "summary"> {
  summary: AcceptanceStatusReport["summary"] & {
    pass_ready_required: number;
    review_required: string[];
    audit_status: "audit-incomplete" | "ready-for-human-review";
  };
  scenarios: AcceptanceScenarioAudit[];
}

export interface AcceptanceCheckResult {
  ok: boolean;
  audit_status: AcceptanceAuditReport["summary"]["audit_status"];
  required_total: number;
  pass_ready_required: number;
  review_required: string[];
  report: AcceptanceAuditReport;
}

export interface AcceptanceTodoReport {
  root: string;
  selection: AcceptanceEvidenceSelection;
  generated_at: string;
  summary: {
    required_total: number;
    pass_ready_required: number;
    todo_required: number;
    audit_status: AcceptanceAuditReport["summary"]["audit_status"];
  };
  items: AcceptanceTodoItem[];
  notes: string[];
}

export interface AcceptanceTodoItem {
  id: string;
  required: boolean;
  audit_status: AcceptanceScenarioAudit["audit_status"];
  evidence_files: string[];
  missing_evidence_patterns: string[];
  missing_signals: string[];
  next_steps: string[];
  review_notes: string[];
}

export interface AcceptanceEvidenceSelection {
  mode: "aggregate" | "run" | "latest";
  run: string | null;
  evidence_root: string;
  available_runs: string[];
  warnings: string[];
}

interface ScenarioRequirement {
  id: string;
  required: boolean;
  patterns: EvidencePattern[];
  requiredSignals: string[];
  reviewNotes: string[];
}

type EvidencePattern = { scope: "path" | "basename"; pattern: RegExp };

const SCENARIOS: ScenarioRequirement[] = [
  {
    id: "SR-MVP-P0",
    required: true,
    patterns: [pathPattern(/docs\/providers\/.*provider-coverage-matrix\.md$/)],
    requiredSignals: [],
    reviewNotes: ["Review the provider matrix manually for 9router, FreeLLMAPI, OmniRoute, public docs, and explicit unknown fields."]
  },
  {
    id: "SR-MVP-00",
    required: true,
    patterns: [namePattern(/^00-doctor\.txt$/), namePattern(/^00-models\.txt$/), namePattern(/^00-health\.json$/), namePattern(/^00-v1-models\.json$/)],
    requiredSignals: ["doctor_local_paths"],
    reviewNotes: ["Confirm doctor output redacts secrets and shows localhost-only bind, config, DB, ledger, and key-store paths."]
  },
  {
    id: "SR-MVP-01",
    required: true,
    patterns: [namePattern(/^01-chat-.*\.(txt|json)$/), namePattern(/^01-.*explain.*\.txt$/)],
    requiredSignals: ["request_id", "endpoint:/v1/chat/completions", "provider", "success_status"],
    reviewNotes: ["Confirm the client request went through SteadyRoute and did not call a provider directly."]
  },
  {
    id: "SR-MVP-02",
    required: true,
    patterns: [namePattern(/^02-stream.*\.(sse|txt)$/), namePattern(/^02-.*explain.*\.txt$/)],
    requiredSignals: ["request_id", "provider", "stream_metadata"],
    reviewNotes: ["Confirm the saved SSE showed incremental output and explain includes chunk/timing/final-text evidence."]
  },
  {
    id: "SR-MVP-03",
    required: true,
    patterns: [namePattern(/^03-codex-responses.*\.txt$/), namePattern(/^03-explain.*\.txt$/)],
    requiredSignals: ["request_id", "endpoint:/v1/responses", "provider", "success_status"],
    reviewNotes: ["Confirm Codex modified a real dogfood project and validation commands ran through SteadyRoute."]
  },
  {
    id: "SR-MVP-04",
    required: true,
    patterns: [namePattern(/^04-.*-explain\.txt$/)],
    requiredSignals: ["four_providers", "success_status"],
    reviewNotes: ["Confirm the four providers are distinct real upstream providers and provider constraints were honored."]
  },
  {
    id: "SR-MVP-06",
    required: true,
    patterns: [namePattern(/^06-.*body\.json$/), namePattern(/^06-.*explain.*\.txt$/)],
    requiredSignals: ["request_id", "provider", "tool_or_structured_shape"],
    reviewNotes: ["Confirm the request used a real tool-call or structured-output shape through SteadyRoute."]
  },
  {
    id: "SR-MVP-07",
    required: true,
    patterns: [namePattern(/^07-.*explain.*\.txt$/)],
    requiredSignals: ["request_id", "error_class"],
    reviewNotes: ["Confirm the controlled failure setup is visible and fallback behavior matches the error taxonomy."]
  },
  {
    id: "SR-MVP-08",
    required: true,
    patterns: [namePattern(/^08-doctor\.txt$/), namePattern(/^08-.*explain.*\.txt$/)],
    requiredSignals: ["request_id", "usage_or_quota", "doctor_local_paths"],
    reviewNotes: ["Confirm usage and quota labels are provider-reported, observed, estimated, or unknown, never guessed."]
  },
  {
    id: "SR-MVP-09",
    required: true,
    patterns: [namePattern(/^09-.*after.*\.txt$/), namePattern(/^09-.*explain.*\.txt$/)],
    requiredSignals: ["request_id", "doctor_local_paths"],
    reviewNotes: ["Confirm explain works after restart and local state paths are unchanged."]
  },
  {
    id: "SR-MVP-10",
    required: true,
    patterns: [namePattern(/^10-responses-body\.json$/), namePattern(/^10-.*explain.*\.txt$/)],
    requiredSignals: ["request_id", "endpoint:/v1/responses", "provider", "success_status"],
    reviewNotes: ["Confirm the response shape is Responses-compatible and explain distinguishes it from Chat Completions."]
  }
];

export function initAcceptanceRun(options: AcceptanceInitOptions = {}): AcceptanceInitResult {
  const root = path.resolve(options.root ?? ".steadyroute-acceptance");
  const run = options.run?.trim() || defaultRunName(new Date());
  if (!isSafeRunName(run)) throw new Error(`Invalid acceptance run name: ${run}`);
  const evidenceDir = path.join(root, run);
  const manifestPath = path.join(evidenceDir, "manifest.json");
  const captureScriptPath = path.join(evidenceDir, "capture.sh");
  const commandsPath = path.join(evidenceDir, "commands.md");
  const exists = fs.existsSync(evidenceDir);
  if (exists && !options.force) {
    throw new Error(`Acceptance evidence run already exists: ${evidenceDir}`);
  }

  fs.mkdirSync(evidenceDir, { recursive: true });
  const manifest: AcceptanceRunManifest = {
    schema_version: 1,
    run,
    created_at: new Date().toISOString(),
    evidence_dir: evidenceDir,
    required_scenarios: SCENARIOS.filter((scenario) => scenario.required).map((scenario) => scenario.id),
    optional_scenarios: ["SR-MVP-05"],
    notes: [
      "Store scenario commands, client output, request ids, and steadyroute explain output in this directory.",
      "This manifest does not prove acceptance; run steadyroute acceptance audit after evidence is captured."
    ]
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(captureScriptPath, acceptanceCaptureScript(), { mode: 0o755 });
  fs.chmodSync(captureScriptPath, 0o755);
  fs.writeFileSync(commandsPath, acceptanceCommandsMarkdown(run), { mode: 0o644 });

  return {
    root,
    run,
    evidence_dir: evidenceDir,
    manifest_path: manifestPath,
    capture_script_path: captureScriptPath,
    commands_path: commandsPath,
    created: !exists,
    manifest,
    shell_exports: [
      `export SR_EVIDENCE_DIR=${shellQuote(evidenceDir)}`,
      `export SR_CAPTURE_SCRIPT=${shellQuote(captureScriptPath)}`
    ]
  };
}

export function formatAcceptanceInit(result: AcceptanceInitResult, options: { printEnv?: boolean } = {}): string {
  if (options.printEnv) return result.shell_exports.join("\n");
  return [
    "SteadyRoute acceptance evidence run",
    `Run: ${result.run}`,
    `Evidence dir: ${result.evidence_dir}`,
    `Manifest: ${result.manifest_path}`,
    `Capture script: ${result.capture_script_path}`,
    `Command notes: ${result.commands_path}`,
    `Created: ${result.created}`,
    "",
    "Shell:",
    ...result.shell_exports,
    "",
    "Next:",
    "Review commands.md or edit capture.sh, then run the MVP scenarios and save command output plus steadyroute explain output into this directory.",
    `Then inspect it with: steadyroute acceptance audit --run ${result.run}`
  ].join("\n");
}

function acceptanceCaptureScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

: "\${SR_EVIDENCE_DIR:?Set SR_EVIDENCE_DIR to this run directory first.}"

STEADYROUTE_BASE_URL="\${STEADYROUTE_BASE_URL:-http://127.0.0.1:3001}"
STEADYROUTE_API_KEY="\${STEADYROUTE_API_KEY:-steadyroute-local}"

echo "Evidence dir: $SR_EVIDENCE_DIR"
echo "Base URL: $STEADYROUTE_BASE_URL"
echo
echo "This script is a capture template. Review each command before running it."
echo "It saves local evidence only; provider requests happen only when you run a scenario command."

capture_baseline() {
  steadyroute doctor | tee "$SR_EVIDENCE_DIR/00-doctor.txt"
  steadyroute models | tee "$SR_EVIDENCE_DIR/00-models.txt"
  curl -sS "$STEADYROUTE_BASE_URL/health" | tee "$SR_EVIDENCE_DIR/00-health.json"
  curl -sS "$STEADYROUTE_BASE_URL/v1/models" | tee "$SR_EVIDENCE_DIR/00-v1-models.json"
}

explain_request() {
  local request_id="\${1:?request id required}"
  local output="\${2:?output file required}"
  steadyroute explain "$request_id" | tee "$SR_EVIDENCE_DIR/$output"
}

echo "Available helper functions:"
echo "  capture_baseline"
echo "  explain_request <request-id> <output-file>"
`;
}

function acceptanceCommandsMarkdown(run: string): string {
  return `# SteadyRoute Acceptance Capture Commands

Run: ${run}

This file is a local capture checklist generated by \`steadyroute acceptance init\`.
It does not prove final MVP acceptance and it does not run providers by itself.
Use only provider accounts and keys you are authorized to use.

## Setup

\`\`\`bash
export SR_EVIDENCE_DIR="$PWD/.steadyroute-acceptance/${run}"
export STEADYROUTE_BASE_URL="http://127.0.0.1:3001"
export STEADYROUTE_API_KEY="steadyroute-local"
steadyroute start --host 127.0.0.1 --port 3001
\`\`\`

## SR-MVP-00 Baseline

\`\`\`bash
steadyroute doctor | tee "$SR_EVIDENCE_DIR/00-doctor.txt"
steadyroute models | tee "$SR_EVIDENCE_DIR/00-models.txt"
curl -sS "$STEADYROUTE_BASE_URL/health" | tee "$SR_EVIDENCE_DIR/00-health.json"
curl -sS "$STEADYROUTE_BASE_URL/v1/models" | tee "$SR_EVIDENCE_DIR/00-v1-models.json"
\`\`\`

## SR-MVP-01 Chat Completions

\`\`\`bash
curl -sS -D "$SR_EVIDENCE_DIR/01-chat-headers.txt" \\
  "$STEADYROUTE_BASE_URL/v1/chat/completions" \\
  -H 'content-type: application/json' \\
  -H "authorization: Bearer $STEADYROUTE_API_KEY" \\
  -d '{"model":"steadyroute:auto","messages":[{"role":"user","content":"Return exactly: chat completion ok"}]}' \\
  | tee "$SR_EVIDENCE_DIR/01-chat-body.json"

steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/01-explain.txt"
\`\`\`

## SR-MVP-02 Streaming

\`\`\`bash
curl --no-buffer -sS -D "$SR_EVIDENCE_DIR/02-stream-headers.txt" \\
  "$STEADYROUTE_BASE_URL/v1/chat/completions" \\
  -H 'content-type: application/json' \\
  -H "authorization: Bearer $STEADYROUTE_API_KEY" \\
  -d '{"model":"steadyroute:auto","stream":true,"messages":[{"role":"user","content":"Write five short numbered lines about request tracing."}]}' \\
  | tee "$SR_EVIDENCE_DIR/02-stream.sse"

steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/02-explain.txt"
\`\`\`

## SR-MVP-03 Codex Responses Dogfood

\`\`\`bash
export DOGFOOD_PARENT="$(mktemp -d /tmp/steadyroute-dogfood.XXXXXX)"
export DOGFOOD_PROJECT="$DOGFOOD_PARENT/launchboard"
mkdir -p "$DOGFOOD_PROJECT"
git -C "$DOGFOOD_PROJECT" init
git -C "$DOGFOOD_PROJECT" config user.name "SteadyRoute Dogfood"
git -C "$DOGFOOD_PROJECT" config user.email "steadyroute-dogfood@example.local"

STEADYROUTE_LOCAL_KEY="$STEADYROUTE_API_KEY" \\
codex exec \\
  --cd "$DOGFOOD_PROJECT" \\
  --sandbox workspace-write \\
  --ask-for-approval never \\
  -c 'model="steadyroute:auto"' \\
  -c 'model_provider="steadyroute"' \\
  -c 'model_providers.steadyroute.name="SteadyRoute Local"' \\
  -c 'model_providers.steadyroute.base_url="http://127.0.0.1:3001/v1"' \\
  -c 'model_providers.steadyroute.wire_api="responses"' \\
  -c 'model_providers.steadyroute.env_key="STEADYROUTE_LOCAL_KEY"' \\
  'Build LaunchBoard, a small full-stack launch tracker for indie products, in this empty project. Create Dashboard, Products, Product Detail, and Settings pages. Add API routes to list products, create products, read a product, update a product, and add launch checklist tasks. Use SQLite, JSON-file storage, or in-memory storage. Include forms, filtering, a launch checklist, notes or activity timeline, and team/settings state. Install dependencies, run a real build/test/lint/typecheck command, fix failures caused by your implementation, and summarize changed files plus the final verification command.' \\
  2>&1 | tee "$SR_EVIDENCE_DIR/03-codex-responses.txt"

steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/03-explain.txt"
\`\`\`

## SR-MVP-04 Provider Matrix

\`\`\`bash
for PROVIDER in openrouter kilo github_models groq gemini; do
  curl -sS -D "$SR_EVIDENCE_DIR/04-$PROVIDER-headers.txt" \\
    "$STEADYROUTE_BASE_URL/v1/chat/completions" \\
    -H 'content-type: application/json' \\
    -H "authorization: Bearer $STEADYROUTE_API_KEY" \\
    -H "x-steadyroute-provider-allowlist: $PROVIDER" \\
    -d '{"model":"steadyroute:auto","messages":[{"role":"user","content":"Return exactly: provider smoke ok"}]}' \\
    | tee "$SR_EVIDENCE_DIR/04-$PROVIDER-body.json"
  steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/04-$PROVIDER-explain.txt"
done
\`\`\`

## SR-MVP-06 Tool Or Structured Shape

\`\`\`bash
curl -sS -D "$SR_EVIDENCE_DIR/06-tools-headers.txt" \\
  "$STEADYROUTE_BASE_URL/v1/chat/completions" \\
  -H 'content-type: application/json' \\
  -H "authorization: Bearer $STEADYROUTE_API_KEY" \\
  -d '{"model":"steadyroute:auto","messages":[{"role":"user","content":"Use the provided tool to report the package name steadyroute-dogfood."}],"tools":[{"type":"function","function":{"name":"report_package","description":"Report the package name found during dogfood.","parameters":{"type":"object","properties":{"name":{"type":"string"}},"required":["name"],"additionalProperties":false}}}],"tool_choice":"auto"}' \\
  | tee "$SR_EVIDENCE_DIR/06-tools-body.json"

steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/06-explain.txt"
\`\`\`

## SR-MVP-07 Controlled Failure

\`\`\`bash
steadyroute keys add openrouter --alias dogfood-invalid --value sk-steadyroute-invalid
curl -sS -D "$SR_EVIDENCE_DIR/07-failure-headers.txt" \\
  "$STEADYROUTE_BASE_URL/v1/chat/completions" \\
  -H 'content-type: application/json' \\
  -H "authorization: Bearer $STEADYROUTE_API_KEY" \\
  -H 'x-steadyroute-route-policy: dogfood-invalid-key-then-fallback' \\
  -d '{"model":"steadyroute:auto","messages":[{"role":"user","content":"Return exactly: fallback classification ok"}]}' \\
  | tee "$SR_EVIDENCE_DIR/07-failure-body.json"

steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/07-explain.txt"
\`\`\`

## SR-MVP-08 Usage And Quota Honesty

\`\`\`bash
steadyroute doctor | tee "$SR_EVIDENCE_DIR/08-doctor.txt"
steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/08-$PROVIDER-explain.txt"
\`\`\`

## SR-MVP-09 Restart Persistence

\`\`\`bash
steadyroute doctor | tee "$SR_EVIDENCE_DIR/09-doctor-before.txt"
# Stop and restart SteadyRoute, then explain a previous request id:
steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/09-explain-after-restart.txt"
steadyroute doctor | tee "$SR_EVIDENCE_DIR/09-doctor-after.txt"
\`\`\`

## SR-MVP-10 Direct Responses

\`\`\`bash
curl -sS -D "$SR_EVIDENCE_DIR/10-responses-headers.txt" \\
  "$STEADYROUTE_BASE_URL/v1/responses" \\
  -H 'content-type: application/json' \\
  -H "authorization: Bearer $STEADYROUTE_API_KEY" \\
  -d '{"model":"steadyroute:auto","input":"Return exactly: responses ok"}' \\
  | tee "$SR_EVIDENCE_DIR/10-responses-body.json"

steadyroute explain "$REQUEST_ID" | tee "$SR_EVIDENCE_DIR/10-explain.txt"
\`\`\`

## Check Evidence

\`\`\`bash
steadyroute acceptance audit --run ${run}
steadyroute acceptance todo --run ${run}
steadyroute acceptance check --run ${run}
\`\`\`
`;
}

export function acceptanceScenarioListRows(): AcceptanceScenarioListRow[] {
  return SCENARIOS.map((scenario) => ({
    id: scenario.id,
    required: scenario.required,
    evidence_patterns: scenario.patterns.map((pattern) => `${pattern.scope}:${pattern.pattern.source}`),
    required_signals: scenario.requiredSignals,
    review_notes: scenario.reviewNotes
  }));
}

export function formatAcceptanceScenarioList(rows: AcceptanceScenarioListRow[]): string {
  const requiredCount = rows.filter((row) => row.required).length;
  const lines = [
    "SteadyRoute MVP acceptance scenarios",
    `Required: ${requiredCount}/${rows.length}`,
    ""
  ];
  for (const row of rows) {
    lines.push(`${row.id}: ${row.required ? "required" : "optional"}`);
    if (row.evidence_patterns.length > 0) lines.push(`  evidence: ${row.evidence_patterns.join(", ")}`);
    if (row.required_signals.length > 0) lines.push(`  signals: ${row.required_signals.join(", ")}`);
    for (const note of row.review_notes) lines.push(`  review: ${note}`);
  }
  return lines.join("\n");
}

export function buildAcceptanceStatus(options: AcceptanceStatusOptions = {}): AcceptanceStatusReport {
  const root = path.resolve(options.root ?? ".steadyroute-acceptance");
  const selection = selectEvidenceRoot(root, options);
  const files = listEvidenceFiles(selection.evidence_root);
  const projectFiles = ["docs/providers/2026-07-02-provider-coverage-matrix.md"].filter((file) => fs.existsSync(file));
  const searchable = [...files, ...projectFiles];
  const scenarios = SCENARIOS.map((scenario) => scenarioStatus(scenario, searchable));
  const missingRequired = scenarios.filter((scenario) => scenario.required && scenario.status === "missing").map((scenario) => scenario.id);
  const requiredTotal = scenarios.filter((scenario) => scenario.required).length;
  return {
    root,
    selection,
    generated_at: new Date().toISOString(),
    summary: {
      required_total: requiredTotal,
      required_with_evidence: requiredTotal - missingRequired.length,
      missing_required: missingRequired,
      gate_status: missingRequired.length === 0 ? "evidence-present-unverified" : "evidence-incomplete"
    },
    scenarios,
    notes: [
      ...selection.warnings,
      "This command only checks local evidence file presence. It does not prove scenario pass/fail.",
      "Final MVP acceptance still requires inspecting request ids, provider/model evidence, and real dogfood outputs."
    ]
  };
}

export function formatAcceptanceStatus(report: AcceptanceStatusReport): string {
  const lines = [
    "SteadyRoute acceptance evidence status",
    `Evidence root: ${report.root}`,
    `Mode: ${report.selection.mode}`,
    `Selected root: ${report.selection.evidence_root}`,
    `Required evidence: ${report.summary.required_with_evidence}/${report.summary.required_total}`,
    `Gate status: ${report.summary.gate_status}`,
    ""
  ];
  if (report.selection.run) lines.splice(3, 0, `Run: ${report.selection.run}`);
  if (report.selection.available_runs.length > 0) {
    lines.push(`Available runs: ${report.selection.available_runs.join(", ")}`);
    lines.push("");
  }
  for (const scenario of report.scenarios) {
    lines.push(`${scenario.id}: ${scenario.status}`);
    if (scenario.evidence_files.length > 0) {
      for (const file of scenario.evidence_files.slice(0, 5)) lines.push(`  evidence: ${file}`);
      if (scenario.evidence_files.length > 5) lines.push(`  evidence: +${scenario.evidence_files.length - 5} more`);
    }
    const signalSummary = formatSignals(scenario.signals);
    if (signalSummary) lines.push(`  signals: ${signalSummary}`);
    if (scenario.missing_patterns.length > 0) {
      lines.push(`  missing: ${scenario.missing_patterns.join(", ")}`);
    }
  }
  lines.push("");
  for (const note of report.notes) lines.push(`note: ${note}`);
  return lines.join("\n");
}

export function buildAcceptanceAudit(options: AcceptanceStatusOptions = {}): AcceptanceAuditReport {
  const status = buildAcceptanceStatus(options);
  const scenarios = status.scenarios.map((scenario) => {
    const requirement = SCENARIOS.find((candidate) => candidate.id === scenario.id);
    const requiredSignals = requirement?.requiredSignals ?? [];
    const missingSignals = requiredSignals.filter((signal) => !hasAuditSignal(signal, scenario.signals));
    const auditStatus: AcceptanceScenarioAudit["audit_status"] = scenario.status === "missing"
      ? "missing-evidence"
      : missingSignals.length === 0
        ? "pass-ready"
        : "review-required";
    return {
      ...scenario,
      audit_status: auditStatus,
      required_signals: requiredSignals,
      missing_signals: missingSignals,
      review_notes: requirement?.reviewNotes ?? []
    };
  });
  const requiredScenarios = scenarios.filter((scenario) => scenario.required);
  const reviewRequired = requiredScenarios
    .filter((scenario) => scenario.audit_status !== "pass-ready")
    .map((scenario) => scenario.id);

  return {
    ...status,
    summary: {
      ...status.summary,
      pass_ready_required: requiredScenarios.length - reviewRequired.length,
      review_required: reviewRequired,
      audit_status: reviewRequired.length === 0 ? "ready-for-human-review" : "audit-incomplete"
    },
    scenarios,
    notes: [
      ...status.notes,
      "Audit status is based on machine-readable evidence signals only; human review remains required for final MVP acceptance."
    ]
  };
}

export function buildAcceptanceCheck(options: AcceptanceStatusOptions = {}): AcceptanceCheckResult {
  const report = buildAcceptanceAudit(options);
  return {
    ok: report.summary.audit_status === "ready-for-human-review",
    audit_status: report.summary.audit_status,
    required_total: report.summary.required_total,
    pass_ready_required: report.summary.pass_ready_required,
    review_required: report.summary.review_required,
    report
  };
}

export function formatAcceptanceCheck(result: AcceptanceCheckResult): string {
  const lines = [
    result.ok ? "SteadyRoute acceptance check passed" : "SteadyRoute acceptance check failed",
    `Audit status: ${result.audit_status}`,
    `Pass-ready required scenarios: ${result.pass_ready_required}/${result.required_total}`
  ];
  if (result.review_required.length > 0) lines.push(`Review required: ${result.review_required.join(", ")}`);
  lines.push("note: This check only validates local evidence signals; final MVP acceptance still requires human review of real provider and dogfood evidence.");
  return lines.join("\n");
}

export function buildAcceptanceTodo(options: AcceptanceStatusOptions = {}): AcceptanceTodoReport {
  const report = buildAcceptanceAudit(options);
  const items = report.scenarios
    .filter((scenario) => scenario.required && scenario.audit_status !== "pass-ready")
    .map((scenario) => ({
      id: scenario.id,
      required: scenario.required,
      audit_status: scenario.audit_status,
      evidence_files: scenario.evidence_files,
      missing_evidence_patterns: scenario.missing_patterns,
      missing_signals: scenario.missing_signals,
      next_steps: todoStepsFor(scenario),
      review_notes: scenario.review_notes
    }));

  return {
    root: report.root,
    selection: report.selection,
    generated_at: report.generated_at,
    summary: {
      required_total: report.summary.required_total,
      pass_ready_required: report.summary.pass_ready_required,
      todo_required: items.length,
      audit_status: report.summary.audit_status
    },
    items,
    notes: [
      ...report.selection.warnings,
      "This todo list is generated from local evidence files only. It does not run providers or prove final MVP acceptance.",
      "Run the listed real-provider and dogfood scenarios, then re-run steadyroute acceptance audit or check."
    ]
  };
}

export function formatAcceptanceTodo(report: AcceptanceTodoReport): string {
  const lines = [
    "SteadyRoute acceptance todo",
    `Evidence root: ${report.root}`,
    `Mode: ${report.selection.mode}`,
    `Selected root: ${report.selection.evidence_root}`,
    `Pass-ready required scenarios: ${report.summary.pass_ready_required}/${report.summary.required_total}`,
    `Todo required scenarios: ${report.summary.todo_required}`,
    ""
  ];
  if (report.selection.run) lines.splice(3, 0, `Run: ${report.selection.run}`);
  if (report.items.length === 0) {
    lines.push("No local evidence TODOs remain. Human review of real provider and dogfood evidence is still required before final MVP acceptance.");
  } else {
    for (const item of report.items) {
      lines.push(`${item.id}: ${item.audit_status}`);
      if (item.evidence_files.length > 0) {
        for (const file of item.evidence_files.slice(0, 3)) lines.push(`  evidence: ${file}`);
        if (item.evidence_files.length > 3) lines.push(`  evidence: +${item.evidence_files.length - 3} more`);
      }
      if (item.missing_evidence_patterns.length > 0) lines.push(`  missing evidence: ${item.missing_evidence_patterns.join(", ")}`);
      if (item.missing_signals.length > 0) lines.push(`  missing signals: ${item.missing_signals.join(", ")}`);
      for (const step of item.next_steps) lines.push(`  next: ${step}`);
      for (const note of item.review_notes) lines.push(`  review: ${note}`);
    }
  }
  lines.push("");
  for (const note of report.notes) lines.push(`note: ${note}`);
  return lines.join("\n");
}

export function formatAcceptanceAudit(report: AcceptanceAuditReport): string {
  const lines = [
    "SteadyRoute acceptance evidence audit",
    `Evidence root: ${report.root}`,
    `Mode: ${report.selection.mode}`,
    `Selected root: ${report.selection.evidence_root}`,
    `Required evidence: ${report.summary.required_with_evidence}/${report.summary.required_total}`,
    `Pass-ready required scenarios: ${report.summary.pass_ready_required}/${report.summary.required_total}`,
    `Audit status: ${report.summary.audit_status}`,
    ""
  ];
  if (report.selection.run) lines.splice(3, 0, `Run: ${report.selection.run}`);
  if (report.selection.available_runs.length > 0) {
    lines.push(`Available runs: ${report.selection.available_runs.join(", ")}`);
    lines.push("");
  }
  for (const scenario of report.scenarios) {
    lines.push(`${scenario.id}: ${scenario.audit_status}`);
    const signalSummary = formatSignals(scenario.signals);
    if (signalSummary) lines.push(`  signals: ${signalSummary}`);
    if (scenario.missing_patterns.length > 0) lines.push(`  missing evidence: ${scenario.missing_patterns.join(", ")}`);
    if (scenario.missing_signals.length > 0) lines.push(`  missing signals: ${scenario.missing_signals.join(", ")}`);
    for (const note of scenario.review_notes) lines.push(`  review: ${note}`);
  }
  lines.push("");
  for (const note of report.notes) lines.push(`note: ${note}`);
  return lines.join("\n");
}

function hasAuditSignal(signal: string, signals: AcceptanceEvidenceSignals): boolean {
  if (signal === "request_id") return signals.request_ids.length > 0;
  if (signal === "provider") return signals.providers.length > 0;
  if (signal === "success_status") return signals.final_statuses.some((status) => /success/i.test(status));
  if (signal === "error_class") return signals.error_classes.length > 0;
  if (signal === "doctor_local_paths") return signals.doctor_local_paths;
  if (signal === "stream_metadata") return signals.stream_metadata;
  if (signal === "usage_or_quota") return signals.usage_or_quota;
  if (signal === "tool_or_structured_shape") return signals.tool_or_structured_shape;
  if (signal === "four_providers") return signals.providers.length >= 4;
  if (signal.startsWith("endpoint:")) return signals.endpoints.includes(signal.slice("endpoint:".length));
  return false;
}

function todoStepsFor(scenario: AcceptanceScenarioAudit): string[] {
  const base: Record<string, string[]> = {
    "SR-MVP-P0": [
      "Keep docs/providers/2026-07-02-provider-coverage-matrix.md current with every 9router, FreeLLMAPI, OmniRoute, and public provider candidate.",
      "Mark each provider as verified, implemented-unverified, blocked-by-auth, catalog-only, broken, or deprecated with evidence."
    ],
    "SR-MVP-00": [
      "Run steadyroute doctor, steadyroute models, /health, and /v1/models; save 00-doctor.txt, 00-models.txt, 00-health.json, and 00-v1-models.json.",
      "Confirm doctor output shows config, DB, ledger, key store, and local_only=true without printing secrets."
    ],
    "SR-MVP-01": [
      "Run a real OpenAI-compatible SDK or client through http://127.0.0.1:3001/v1/chat/completions and save 01-chat-* output.",
      "Extract the SteadyRoute request id and save steadyroute explain output as 01-explain.txt."
    ],
    "SR-MVP-02": [
      "Run a streaming chat request through SteadyRoute and save the SSE stream as 02-stream.sse or 02-stream.txt.",
      "Save steadyroute explain output as 02-explain.txt and confirm chunk/timing metadata appears."
    ],
    "SR-MVP-03": [
      "Run Codex CLI against SteadyRoute with wire_api=responses on the LaunchBoard dogfood project and save 03-codex-responses.txt.",
      "Save steadyroute explain output for a Codex request id as 03-explain.txt and confirm endpoint /v1/responses."
    ],
    "SR-MVP-04": [
      "Run constrained provider smokes through SteadyRoute for at least four distinct real providers and save 04-<provider>-explain.txt for each.",
      "Confirm every counted provider is a distinct upstream and at least one no-login route works."
    ],
    "SR-MVP-06": [
      "Run a real tool-call or structured request through SteadyRoute and save 06-*-body.json.",
      "Save 06-*-explain.txt with tools_present, tool_names, or structured output evidence."
    ],
    "SR-MVP-07": [
      "Run a controlled failure through SteadyRoute, such as dogfood-invalid-key-then-fallback, and save 07-*-explain.txt.",
      "Confirm explain shows the attempted failing provider/key/model and a precise normalized error class."
    ],
    "SR-MVP-08": [
      "Save steadyroute doctor as 08-doctor.txt and explain output for at least one real request as 08-<provider>-explain.txt.",
      "Confirm usage or quota fields are labeled provider, observed, estimated, or unknown."
    ],
    "SR-MVP-09": [
      "Restart SteadyRoute, prove the same local state still works, and save 09-*-after*.txt plus 09-*-explain.txt.",
      "Include doctor output after restart so config, DB, ledger, and local_only=true are visible."
    ],
    "SR-MVP-10": [
      "Run a direct /v1/responses request through SteadyRoute and save 10-responses-body.json.",
      "Save 10-*-explain.txt and confirm endpoint /v1/responses plus final provider/model evidence."
    ]
  };
  const steps = [...(base[scenario.id] ?? ["Capture the missing evidence files and request signals defined by docs/mvp-acceptance.md."])];
  if (scenario.missing_patterns.length > 0) steps.push(`Add evidence matching: ${scenario.missing_patterns.join(", ")}`);
  if (scenario.missing_signals.length > 0) steps.push(`Add explain/doctor signals: ${scenario.missing_signals.join(", ")}`);
  return steps;
}

function selectEvidenceRoot(root: string, options: AcceptanceStatusOptions): AcceptanceEvidenceSelection {
  const availableRuns = listRunDirectories(root);
  const requestedRun = options.run?.trim();
  const warnings: string[] = [];

  if (requestedRun) {
    if (!isSafeRunName(requestedRun)) {
      warnings.push(`Ignored invalid run name: ${requestedRun}`);
      return {
        mode: "run",
        run: requestedRun,
        evidence_root: path.join(root, "__invalid_run__"),
        available_runs: availableRuns,
        warnings
      };
    }
    const evidenceRoot = path.join(root, requestedRun);
    if (!fs.existsSync(evidenceRoot) || !fs.statSync(evidenceRoot).isDirectory()) {
      warnings.push(`Selected run has no evidence directory: ${requestedRun}`);
    }
    return {
      mode: "run",
      run: requestedRun,
      evidence_root: evidenceRoot,
      available_runs: availableRuns,
      warnings
    };
  }

  if (options.latest) {
    const latestRun = latestRunDirectory(root);
    if (!latestRun) {
      warnings.push(`No run directories found under ${root}`);
      return {
        mode: "latest",
        run: null,
        evidence_root: path.join(root, "__missing_latest_run__"),
        available_runs: availableRuns,
        warnings
      };
    }
    return {
      mode: "latest",
      run: latestRun,
      evidence_root: path.join(root, latestRun),
      available_runs: availableRuns,
      warnings
    };
  }

  return {
    mode: "aggregate",
    run: null,
    evidence_root: root,
    available_runs: availableRuns,
    warnings
  };
}

function listRunDirectories(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function latestRunDirectory(root: string): string | null {
  const candidates = listRunDirectories(root)
    .map((name) => {
      try {
        return { name, mtimeMs: fs.statSync(path.join(root, name)).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((candidate): candidate is { name: string; mtimeMs: number } => Boolean(candidate));

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
  return candidates[0]?.name ?? null;
}

function isSafeRunName(run: string): boolean {
  return run !== "." && run !== ".." && !run.includes("/") && !run.includes("\\") && !path.isAbsolute(run);
}

function defaultRunName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function scenarioStatus(scenario: ScenarioRequirement, files: string[]): AcceptanceScenarioStatus {
  const evidence = new Set<string>();
  const missingPatterns: string[] = [];
  for (const pattern of scenario.patterns) {
    const matches = files.filter((file) => matchesPattern(file, pattern));
    if (matches.length === 0) {
      missingPatterns.push(pattern.pattern.source);
      continue;
    }
    for (const match of matches) evidence.add(match);
  }
  return {
    id: scenario.id,
    required: scenario.required,
    status: missingPatterns.length === 0 ? "evidence-present" : "missing",
    evidence_files: [...evidence].sort(),
    missing_patterns: missingPatterns,
    signals: collectSignals([...evidence])
  };
}

function collectSignals(files: string[]): AcceptanceEvidenceSignals {
  const requestIds = new Set<string>();
  const endpoints = new Set<string>();
  const providers = new Set<string>();
  const finalStatuses = new Set<string>();
  const errorClasses = new Set<string>();
  let explainFiles = 0;
  let doctorFiles = 0;
  let doctorLocalPaths = false;
  let streamMetadata = false;
  let usageOrQuota = false;
  let toolOrStructuredShape = false;

  for (const file of files) {
    const normalized = normalizePath(file);
    const text = readSmallText(file);
    if (!text) continue;
    if (/explain.*\.txt$/.test(normalized)) {
      explainFiles += 1;
      addMatch(text, /^SteadyRoute request (.+)$/m, requestIds);
      addMatch(text, /^Endpoint: (.+)$/m, endpoints);
      addMatch(text, /^Status: (.+)$/m, finalStatuses);
      addMatch(text, /^Final provider\/model: ([^/]+) \//m, providers);
      for (const match of text.matchAll(/error: ([a-z_]+)/g)) errorClasses.add(match[1]);
      if (/^Stream metadata:$/m.test(text) && /^- chunk_count: [1-9][0-9]*/m.test(text)) streamMetadata = true;
      if (/^\s*usage: .*\((provider|observed|estimated|unknown)\)/m.test(text) || /^\s*quota: /m.test(text)) usageOrQuota = true;
      if (/^- tools_present: true$/m.test(text) || /^- tool_names: /m.test(text)) toolOrStructuredShape = true;
      if (/^- structured_output: (?!none$).+/m.test(text)) toolOrStructuredShape = true;
    }
    if (/doctor.*\.txt$/.test(normalized)) {
      doctorFiles += 1;
      if (/Config path: .+\nDB path: .+\nLedger path: /m.test(text) && /local_only=true/.test(text)) {
        doctorLocalPaths = true;
      }
    }
  }

  return {
    explain_files: explainFiles,
    request_ids: [...requestIds].sort(),
    endpoints: [...endpoints].sort(),
    providers: [...providers].sort(),
    final_statuses: [...finalStatuses].sort(),
    error_classes: [...errorClasses].sort(),
    doctor_files: doctorFiles,
    doctor_local_paths: doctorLocalPaths,
    stream_metadata: streamMetadata,
    usage_or_quota: usageOrQuota,
    tool_or_structured_shape: toolOrStructuredShape
  };
}

function formatSignals(signals: AcceptanceEvidenceSignals): string {
  const parts: string[] = [];
  if (signals.explain_files > 0) parts.push(`explain_files=${signals.explain_files}`);
  if (signals.request_ids.length > 0) parts.push(`request_ids=${signals.request_ids.length}`);
  if (signals.endpoints.length > 0) parts.push(`endpoints=${signals.endpoints.join("|")}`);
  if (signals.providers.length > 0) parts.push(`providers=${signals.providers.join("|")}`);
  if (signals.error_classes.length > 0) parts.push(`errors=${signals.error_classes.join("|")}`);
  if (signals.doctor_files > 0) parts.push(`doctor_files=${signals.doctor_files}`);
  if (signals.doctor_local_paths) parts.push("doctor_local_paths=true");
  if (signals.stream_metadata) parts.push("stream_metadata=true");
  if (signals.usage_or_quota) parts.push("usage_or_quota=true");
  if (signals.tool_or_structured_shape) parts.push("tool_or_structured_shape=true");
  return parts.join(" ");
}

function addMatch(text: string, pattern: RegExp, out: Set<string>): void {
  const match = text.match(pattern);
  if (match?.[1]) out.add(match[1].trim());
}

function readSmallText(file: string): string | null {
  try {
    const stat = fs.statSync(file);
    if (stat.size > 1024 * 1024) return null;
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function listEvidenceFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (!stat.isDirectory()) return [];
  const out: string[] = [];
  walk(root, out);
  return out.map((file) => path.relative(process.cwd(), file)).sort();
}

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "venv" || entry.name === "node_modules") continue;
      walk(fullPath, out);
    } else if (entry.isFile()) {
      out.push(fullPath);
    }
  }
}

function normalizePath(file: string): string {
  return file.split(path.sep).join("/");
}

function matchesPattern(file: string, evidencePattern: EvidencePattern): boolean {
  const normalized = normalizePath(file);
  const target = evidencePattern.scope === "basename" ? path.posix.basename(normalized) : normalized;
  return evidencePattern.pattern.test(target);
}

function namePattern(pattern: RegExp): EvidencePattern {
  return { scope: "basename", pattern };
}

function pathPattern(pattern: RegExp): EvidencePattern {
  return { scope: "path", pattern };
}

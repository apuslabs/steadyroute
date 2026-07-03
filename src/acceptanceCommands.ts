import fs from "node:fs";
import path from "node:path";

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

export interface AcceptanceEvidenceSignals {
  explain_files: number;
  request_ids: string[];
  endpoints: string[];
  providers: string[];
  final_statuses: string[];
  error_classes: string[];
  doctor_files: number;
  doctor_local_paths: boolean;
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
}

type EvidencePattern = { scope: "path" | "basename"; pattern: RegExp };

const SCENARIOS: ScenarioRequirement[] = [
  { id: "SR-MVP-P0", required: true, patterns: [pathPattern(/docs\/providers\/.*provider-coverage-matrix\.md$/)] },
  { id: "SR-MVP-00", required: true, patterns: [namePattern(/^00-doctor\.txt$/), namePattern(/^00-models\.txt$/), namePattern(/^00-health\.json$/), namePattern(/^00-v1-models\.json$/)] },
  { id: "SR-MVP-01", required: true, patterns: [namePattern(/^01-chat-.*\.(txt|json)$/), namePattern(/^01-.*explain.*\.txt$/)] },
  { id: "SR-MVP-02", required: true, patterns: [namePattern(/^02-stream.*\.(sse|txt)$/), namePattern(/^02-.*explain.*\.txt$/)] },
  { id: "SR-MVP-03", required: true, patterns: [namePattern(/^03-codex-responses.*\.txt$/), namePattern(/^03-explain.*\.txt$/)] },
  { id: "SR-MVP-04", required: true, patterns: [namePattern(/^04-.*-explain\.txt$/)] },
  { id: "SR-MVP-06", required: true, patterns: [namePattern(/^06-.*body\.json$/), namePattern(/^06-.*explain.*\.txt$/)] },
  { id: "SR-MVP-07", required: true, patterns: [namePattern(/^07-.*explain.*\.txt$/)] },
  { id: "SR-MVP-08", required: true, patterns: [namePattern(/^08-doctor\.txt$/), namePattern(/^08-.*explain.*\.txt$/)] },
  { id: "SR-MVP-09", required: true, patterns: [namePattern(/^09-.*after.*\.txt$/), namePattern(/^09-.*explain.*\.txt$/)] },
  { id: "SR-MVP-10", required: true, patterns: [namePattern(/^10-responses-body\.json$/), namePattern(/^10-.*explain.*\.txt$/)] }
];

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
    doctor_local_paths: doctorLocalPaths
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

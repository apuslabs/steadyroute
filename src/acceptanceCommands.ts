import fs from "node:fs";
import path from "node:path";

export interface AcceptanceStatusOptions {
  root?: string;
}

export interface AcceptanceScenarioStatus {
  id: string;
  required: boolean;
  status: "evidence-present" | "missing";
  evidence_files: string[];
  missing_patterns: string[];
}

export interface AcceptanceStatusReport {
  root: string;
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

interface ScenarioRequirement {
  id: string;
  required: boolean;
  patterns: RegExp[];
}

const SCENARIOS: ScenarioRequirement[] = [
  { id: "SR-MVP-P0", required: true, patterns: [/docs\/providers\/.*provider-coverage-matrix\.md$/] },
  { id: "SR-MVP-00", required: true, patterns: [/00-doctor\.txt$/, /00-models\.txt$/, /00-health\.json$/, /00-v1-models\.json$/] },
  { id: "SR-MVP-01", required: true, patterns: [/01-chat-.*\.(txt|json)$/, /01-explain\.txt$/] },
  { id: "SR-MVP-02", required: true, patterns: [/02-stream.*\.(sse|txt)$/, /02-explain\.txt$/] },
  { id: "SR-MVP-03", required: true, patterns: [/03-codex-responses.*\.txt$/, /03-explain.*\.txt$/] },
  { id: "SR-MVP-04", required: true, patterns: [/04-.*-explain\.txt$/] },
  { id: "SR-MVP-06", required: true, patterns: [/06-.*body\.json$/, /06-explain\.txt$/] },
  { id: "SR-MVP-07", required: true, patterns: [/07-.*explain.*\.txt$/] },
  { id: "SR-MVP-08", required: true, patterns: [/08-doctor\.txt$/, /08-.*explain.*\.txt$/] },
  { id: "SR-MVP-09", required: true, patterns: [/09-.*after.*\.txt$/, /09-.*explain.*\.txt$/] },
  { id: "SR-MVP-10", required: true, patterns: [/10-responses-body\.json$/, /10-explain\.txt$/] }
];

export function buildAcceptanceStatus(options: AcceptanceStatusOptions = {}): AcceptanceStatusReport {
  const root = path.resolve(options.root ?? ".steadyroute-acceptance");
  const files = listEvidenceFiles(root);
  const projectFiles = ["docs/providers/2026-07-02-provider-coverage-matrix.md"].filter((file) => fs.existsSync(file));
  const searchable = [...files, ...projectFiles];
  const scenarios = SCENARIOS.map((scenario) => scenarioStatus(scenario, searchable));
  const missingRequired = scenarios.filter((scenario) => scenario.required && scenario.status === "missing").map((scenario) => scenario.id);
  const requiredTotal = scenarios.filter((scenario) => scenario.required).length;
  return {
    root,
    generated_at: new Date().toISOString(),
    summary: {
      required_total: requiredTotal,
      required_with_evidence: requiredTotal - missingRequired.length,
      missing_required: missingRequired,
      gate_status: missingRequired.length === 0 ? "evidence-present-unverified" : "evidence-incomplete"
    },
    scenarios,
    notes: [
      "This command only checks local evidence file presence. It does not prove scenario pass/fail.",
      "Final MVP acceptance still requires inspecting request ids, provider/model evidence, and real dogfood outputs."
    ]
  };
}

export function formatAcceptanceStatus(report: AcceptanceStatusReport): string {
  const lines = [
    "SteadyRoute acceptance evidence status",
    `Evidence root: ${report.root}`,
    `Required evidence: ${report.summary.required_with_evidence}/${report.summary.required_total}`,
    `Gate status: ${report.summary.gate_status}`,
    ""
  ];
  for (const scenario of report.scenarios) {
    lines.push(`${scenario.id}: ${scenario.status}`);
    if (scenario.evidence_files.length > 0) {
      for (const file of scenario.evidence_files.slice(0, 5)) lines.push(`  evidence: ${file}`);
      if (scenario.evidence_files.length > 5) lines.push(`  evidence: +${scenario.evidence_files.length - 5} more`);
    }
    if (scenario.missing_patterns.length > 0) {
      lines.push(`  missing: ${scenario.missing_patterns.join(", ")}`);
    }
  }
  lines.push("");
  for (const note of report.notes) lines.push(`note: ${note}`);
  return lines.join("\n");
}

function scenarioStatus(scenario: ScenarioRequirement, files: string[]): AcceptanceScenarioStatus {
  const evidence = new Set<string>();
  const missingPatterns: string[] = [];
  for (const pattern of scenario.patterns) {
    const matches = files.filter((file) => pattern.test(normalizePath(file)));
    if (matches.length === 0) {
      missingPatterns.push(pattern.source);
      continue;
    }
    for (const match of matches) evidence.add(match);
  }
  return {
    id: scenario.id,
    required: scenario.required,
    status: missingPatterns.length === 0 ? "evidence-present" : "missing",
    evidence_files: [...evidence].sort(),
    missing_patterns: missingPatterns
  };
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

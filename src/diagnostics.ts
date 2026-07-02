import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { buildDoctorReport } from "./doctor.js";
import { listProviderKeys, listRecentRequestsWithAttempts } from "./db.js";
import { resolvePaths } from "./paths.js";
import { providerListRows, providerStatusRows } from "./providerCommands.js";
import { PROVIDERS } from "./providers.js";

export interface DiagnosticsExportOptions {
  outputPath?: string;
  includeBodies?: boolean;
  limit?: number;
  probe?: boolean;
}

export async function exportDiagnostics(db: Database.Database, options: DiagnosticsExportOptions = {}): Promise<string> {
  const paths = resolvePaths();
  const limit = options.limit ?? 50;
  const destination = options.outputPath ?? path.join(paths.home, `diagnostics-${timestampSlug()}.json`);
  const bundle = {
    exported_at: new Date().toISOString(),
    format: "steadyroute-diagnostics-v1",
    privacy: {
      secrets_redacted: true,
      request_and_response_bodies: options.includeBodies === true ? "included" : "summarized"
    },
    paths: {
      home: paths.home,
      config: paths.configPath,
      database: paths.dbPath,
      key_store: paths.dbPath
    },
    doctor: await buildDoctorReport(db, options.probe === true),
    providers: {
      catalog: providerListRows(),
      status: await providerStatusRows(db, null, options.probe === true),
      definitions: PROVIDERS.map((provider) => ({
        id: provider.id,
        status: provider.status,
        auth_method: provider.auth.method,
        key_required: provider.auth.required,
        models: provider.models.map((model) => ({
          id: model.id,
          capabilities: model.capabilities,
          priority: model.priority ?? null,
          free_tier: model.freeTier
        })),
        evidence: provider.evidence,
        notes: provider.notes
      }))
    },
    key_store: {
      stored_keys: listProviderKeys(db)
    },
    requests: listRecentRequestsWithAttempts(db, limit).map((entry) => sanitizeRequestEntry(entry, options.includeBodies === true))
  };

  fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
  fs.writeFileSync(destination, `${JSON.stringify(bundle, null, 2)}\n`, { mode: 0o600 });
  return destination;
}

function sanitizeRequestEntry(entry: { request: Record<string, unknown>; attempts: Array<Record<string, unknown>> }, includeBodies: boolean): Record<string, unknown> {
  return {
    request: sanitizeRecord(entry.request, includeBodies),
    attempts: entry.attempts.map((attempt) => sanitizeRecord(attempt, includeBodies))
  };
}

function sanitizeRecord(record: Record<string, unknown>, includeBodies: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!includeBodies && isBodyField(key)) {
      out[key] = summarizeJsonField(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function isBodyField(key: string): boolean {
  return key === "request_body_json" || key === "response_body_json";
}

function summarizeJsonField(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return summarizeValue(parsed);
  } catch {
    return { redacted: true, bytes: value.length };
  }
}

function summarizeValue(value: unknown): unknown {
  if (!value || typeof value !== "object") return { type: typeof value };
  const obj = value as Record<string, unknown>;
  return {
    redacted: true,
    keys: Object.keys(obj).sort(),
    model: typeof obj.model === "string" ? obj.model : undefined,
    stream: obj.stream === true,
    messages_count: Array.isArray(obj.messages) ? obj.messages.length : undefined,
    input_type: "input" in obj ? typeof obj.input : undefined,
    tools_present: Array.isArray(obj.tools) ? obj.tools.length > 0 : Boolean(obj.tools),
    choices_count: Array.isArray(obj.choices) ? obj.choices.length : undefined,
    output_count: Array.isArray(obj.output) ? obj.output.length : undefined,
    error_code: errorCode(obj)
  };
}

function errorCode(obj: Record<string, unknown>): unknown {
  const error = obj.error && typeof obj.error === "object" ? obj.error as Record<string, unknown> : null;
  return error?.code;
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

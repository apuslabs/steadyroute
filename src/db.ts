import Database from "better-sqlite3";
import { decryptSecret, encryptSecret } from "./crypto.js";
import { ensureHome, resolvePaths } from "./paths.js";
import type { ErrorClass, StreamMetadata, UsageEvidence } from "./types.js";

export interface RequestRecordInput {
  requestId: string;
  endpoint: string;
  protocol: string;
  method: string;
  client: string | null;
  modelRequested: string | null;
  routePolicy: string | null;
  providerAllowlist: string[];
  providerDenylist: string[];
  requestBody: unknown;
  catalogSource: string;
  candidates: unknown[];
  skips: unknown[];
  traceFullBodies: boolean;
}

export interface AttemptRecordInput {
  requestId: string;
  attemptIndex: number;
  provider: string;
  model: string;
  keyAlias: string;
  status: "success" | "failed" | "skipped";
  errorClass: ErrorClass | null;
  behavior: unknown;
  upstreamStatus: number | null;
  requestBody: unknown;
  responseBody: unknown;
  responseHeaders: Record<string, string>;
  safeErrorExcerpt: string;
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  usage: UsageEvidence;
  fallbackDecision: string | null;
}

export interface FinalizeRequestInput {
  requestId: string;
  finalStatus: "success" | "failed";
  httpStatus: number;
  finalProvider: string | null;
  finalModel: string | null;
  finalErrorClass: ErrorClass | null;
  responseBody: unknown;
  usage: UsageEvidence | null;
  streamMetadata: StreamMetadata | null;
  fallbackDecisions: unknown[];
}

export function openDb(): Database.Database {
  const paths = ensureHome(resolvePaths());
  const db = new Database(paths.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_keys (
      provider TEXT NOT NULL,
      alias TEXT NOT NULL,
      encrypted_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider, alias)
    );

    CREATE TABLE IF NOT EXISTS requests (
      request_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      endpoint TEXT NOT NULL,
      protocol TEXT NOT NULL,
      method TEXT NOT NULL,
      client TEXT,
      model_requested TEXT,
      route_policy TEXT,
      provider_allowlist_json TEXT NOT NULL,
      provider_denylist_json TEXT NOT NULL,
      request_body_json TEXT NOT NULL,
      response_body_json TEXT,
      final_status TEXT,
      http_status INTEGER,
      final_provider TEXT,
      final_model TEXT,
      final_error_class TEXT,
      catalog_source TEXT NOT NULL,
      candidates_json TEXT NOT NULL,
      skips_json TEXT NOT NULL,
      fallback_decisions_json TEXT NOT NULL DEFAULT '[]',
      usage_json TEXT,
      stream_metadata_json TEXT,
      trace_full_bodies INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id TEXT NOT NULL,
      attempt_index INTEGER NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      key_alias TEXT NOT NULL,
      status TEXT NOT NULL,
      error_class TEXT,
      behavior_json TEXT,
      upstream_status INTEGER,
      request_body_json TEXT NOT NULL,
      response_body_json TEXT,
      response_headers_json TEXT NOT NULL,
      safe_error_excerpt TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      latency_ms INTEGER NOT NULL,
      usage_json TEXT NOT NULL,
      fallback_decision TEXT,
      FOREIGN KEY (request_id) REFERENCES requests(request_id)
    );

    CREATE TABLE IF NOT EXISTS cooldowns (
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      key_alias TEXT NOT NULL,
      error_class TEXT NOT NULL,
      reason TEXT NOT NULL,
      until_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (provider, model, key_alias)
    );
  `);
}

export function addProviderKey(db: Database.Database, provider: string, alias: string, value: string): void {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO provider_keys (provider, alias, encrypted_value, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(provider, alias) DO UPDATE SET encrypted_value = excluded.encrypted_value, updated_at = excluded.updated_at
  `).run(provider, alias, encryptSecret(value), now, now);
}

export function getProviderKey(db: Database.Database, provider: string, alias = "default"): string | null {
  const row = db.prepare("SELECT encrypted_value FROM provider_keys WHERE provider = ? AND alias = ?").get(provider, alias) as { encrypted_value: string } | undefined;
  if (!row) return null;
  return decryptSecret(row.encrypted_value);
}

export function listProviderKeys(db: Database.Database): Array<{ provider: string; alias: string; created_at: string; updated_at: string }> {
  return db.prepare("SELECT provider, alias, created_at, updated_at FROM provider_keys ORDER BY provider, alias").all() as Array<{
    provider: string;
    alias: string;
    created_at: string;
    updated_at: string;
  }>;
}

export function removeProviderKey(db: Database.Database, provider: string, alias: string): boolean {
  const result = db.prepare("DELETE FROM provider_keys WHERE provider = ? AND alias = ?").run(provider, alias);
  return result.changes > 0;
}

export function createRequest(db: Database.Database, input: RequestRecordInput): void {
  db.prepare(`
    INSERT INTO requests (
      request_id, created_at, endpoint, protocol, method, client, model_requested, route_policy,
      provider_allowlist_json, provider_denylist_json, request_body_json, catalog_source,
      candidates_json, skips_json, trace_full_bodies
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.requestId,
    new Date().toISOString(),
    input.endpoint,
    input.protocol,
    input.method,
    input.client,
    input.modelRequested,
    input.routePolicy,
    stringify(input.providerAllowlist),
    stringify(input.providerDenylist),
    stringify(input.traceFullBodies ? input.requestBody : summarizeBody(input.requestBody)),
    input.catalogSource,
    stringify(input.candidates),
    stringify(input.skips),
    input.traceFullBodies ? 1 : 0
  );
}

export function recordAttempt(db: Database.Database, input: AttemptRecordInput): void {
  db.prepare(`
    INSERT INTO attempts (
      request_id, attempt_index, provider, model, key_alias, status, error_class, behavior_json,
      upstream_status, request_body_json, response_body_json, response_headers_json, safe_error_excerpt,
      started_at, ended_at, latency_ms, usage_json, fallback_decision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.requestId,
    input.attemptIndex,
    input.provider,
    input.model,
    input.keyAlias,
    input.status,
    input.errorClass,
    stringify(input.behavior),
    input.upstreamStatus,
    stringify(input.requestBody),
    stringify(input.responseBody),
    stringify(input.responseHeaders),
    input.safeErrorExcerpt,
    input.startedAt,
    input.endedAt,
    input.latencyMs,
    stringify(input.usage),
    input.fallbackDecision
  );
}

export function finalizeRequest(db: Database.Database, input: FinalizeRequestInput): void {
  db.prepare(`
    UPDATE requests
    SET completed_at = ?, final_status = ?, http_status = ?, final_provider = ?, final_model = ?,
        final_error_class = ?, response_body_json = ?, usage_json = ?, stream_metadata_json = ?,
        fallback_decisions_json = ?
    WHERE request_id = ?
  `).run(
    new Date().toISOString(),
    input.finalStatus,
    input.httpStatus,
    input.finalProvider,
    input.finalModel,
    input.finalErrorClass,
    stringify(input.responseBody),
    stringify(input.usage),
    stringify(input.streamMetadata),
    stringify(input.fallbackDecisions),
    input.requestId
  );
}

export function setCooldown(db: Database.Database, provider: string, model: string, keyAlias: string, errorClass: ErrorClass, reason: string, durationMs: number): void {
  const now = Date.now();
  db.prepare(`
    INSERT INTO cooldowns (provider, model, key_alias, error_class, reason, until_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(provider, model, key_alias) DO UPDATE SET
      error_class = excluded.error_class,
      reason = excluded.reason,
      until_ms = excluded.until_ms,
      created_at = excluded.created_at
  `).run(provider, model, keyAlias, errorClass, reason, now + durationMs, new Date(now).toISOString());
}

export function getActiveCooldown(db: Database.Database, provider: string, model: string, keyAlias: string): { error_class: string; reason: string; until_ms: number } | null {
  const row = db.prepare(`
    SELECT error_class, reason, until_ms FROM cooldowns
    WHERE provider = ? AND model = ? AND key_alias = ? AND until_ms > ?
  `).get(provider, model, keyAlias, Date.now()) as { error_class: string; reason: string; until_ms: number } | undefined;
  return row ?? null;
}

export function readRequestWithAttempts(db: Database.Database, requestId: string): { request: Record<string, unknown>; attempts: Array<Record<string, unknown>> } | null {
  const request = db.prepare("SELECT * FROM requests WHERE request_id = ?").get(requestId) as Record<string, unknown> | undefined;
  if (!request) return null;
  const attempts = db.prepare("SELECT * FROM attempts WHERE request_id = ? ORDER BY attempt_index ASC").all(requestId) as Array<Record<string, unknown>>;
  return { request, attempts };
}

export function stringify(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function summarizeBody(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  return {
    model: obj.model,
    stream: obj.stream,
    messages_count: Array.isArray(obj.messages) ? obj.messages.length : undefined,
    input_type: typeof obj.input,
    tools_present: Array.isArray(obj.tools) ? obj.tools.length > 0 : Boolean(obj.tools)
  };
}

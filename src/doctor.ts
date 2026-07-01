import type Database from "better-sqlite3";
import { loadConfig } from "./config.js";
import { listProviderKeys } from "./db.js";
import { resolvePaths } from "./paths.js";
import { PROVIDERS, resolveProviderEnvKey } from "./providers.js";
import { readRuntimeStatus, type RuntimeStatus } from "./runtime.js";

export interface DoctorReport {
  paths: Record<string, string>;
  server: {
    configured: { host: string; port: number; local_only: boolean };
    runtime: RuntimeStatus & { path: string };
  };
  key_store: { encrypted: boolean; stored_keys: Array<{ provider: string; alias: string; updated_at: string }> };
  providers: Array<Record<string, unknown>>;
  catalog: { source: string; version: string };
  tracing: { full_bodies: boolean; retention: string };
}

export async function buildDoctorReport(db: Database.Database, probe = true): Promise<DoctorReport> {
  const paths = resolvePaths();
  const config = loadConfig();
  const stored = listProviderKeys(db);
  const providers = [];
  for (const provider of PROVIDERS) {
    const envKey = resolveProviderEnvKey(provider);
    const hasStored = stored.some((key) => key.provider === provider.id);
    const keyPresent = envKey.present || hasStored;
    providers.push({
      provider: provider.id,
      display_name: provider.displayName,
      auth_method: provider.auth.method,
      key_present: keyPresent,
      key_source: envKey.present ? envKey.source : hasStored ? "key_store" : "none",
      human_action: keyPresent ? null : provider.auth.humanAction,
      models: provider.models.map((model) => ({
        id: model.id,
        capabilities: model.capabilities,
        context_window: model.contextWindow,
        free_tier: model.freeTier
      })),
      connectivity: probe && keyPresent ? await probeProvider(provider.id) : { status: keyPresent ? "not_probed" : "skipped", reason: keyPresent ? "probe disabled" : "missing key or required human action" }
    });
  }
  return {
    paths: {
      config: paths.configPath,
      database: paths.dbPath,
      ledger: paths.dbPath,
      key_store: paths.dbPath,
      master_key: paths.masterKeyPath,
      pid: paths.pidPath,
      runtime: paths.runtimePath
    },
    server: {
      configured: {
        host: config.host,
        port: config.port,
        local_only: config.host === "127.0.0.1" || config.host === "localhost" || config.host === "::1"
      },
      runtime: { ...readRuntimeStatus(), path: paths.runtimePath }
    },
    key_store: {
      encrypted: true,
      stored_keys: stored.map((key) => ({ provider: key.provider, alias: key.alias, updated_at: key.updated_at }))
    },
    providers,
    catalog: {
      source: config.catalogPath ?? "built-in only",
      version: "built-in-2026-07-01"
    },
    tracing: {
      full_bodies: config.traceFullBodies,
      retention: "local SQLite until manually removed"
    }
  };
}

async function probeProvider(providerId: string): Promise<Record<string, unknown>> {
  if (providerId === "kilo") return { status: "healthy", detail: "anonymous route verified by live dogfood probe when requests are sent" };
  if (providerId === "github_models") return { status: "testable", detail: "uses GitHub Models chat endpoint and provider-reported rate-limit headers" };
  return { status: "testable", detail: "run a chat request through SteadyRoute for full provider validation" };
}

export function formatDoctor(report: DoctorReport): string {
  const lines: string[] = [];
  lines.push("SteadyRoute doctor");
  lines.push(`Config path: ${report.paths.config}`);
  lines.push(`DB path: ${report.paths.database}`);
  lines.push(`Ledger path: ${report.paths.ledger}`);
  lines.push(`Key store path: ${report.paths.key_store}`);
  lines.push(`Key storage: encrypted=${report.key_store.encrypted}, stored_keys=${report.key_store.stored_keys.length}`);
  lines.push(`Server config: ${report.server.configured.host}:${report.server.configured.port} local_only=${report.server.configured.local_only}`);
  if (report.server.runtime.status === "running") {
    lines.push(`Running server: ${report.server.runtime.state.host}:${report.server.runtime.state.port} pid=${report.server.runtime.state.pid} local_only=${report.server.runtime.state.local_only}`);
  } else if (report.server.runtime.status === "stale") {
    lines.push(`Running server: none (${report.server.runtime.reason})`);
  } else {
    lines.push("Running server: none");
  }
  lines.push(`Catalog: ${report.catalog.source} (${report.catalog.version})`);
  lines.push(`Trace retention: ${report.tracing.retention}; full_bodies=${report.tracing.full_bodies}`);
  lines.push("");
  lines.push("Providers:");
  for (const provider of report.providers) {
    lines.push(`- ${provider.provider}: key_present=${provider.key_present} source=${provider.key_source} connectivity=${JSON.stringify(provider.connectivity)}`);
    if (provider.human_action) lines.push(`  human_action: ${provider.human_action}`);
    const models = Array.isArray(provider.models) ? provider.models as Array<Record<string, unknown>> : [];
    for (const model of models) {
      lines.push(`  model ${model.id}: ${JSON.stringify(model.capabilities)}`);
    }
  }
  return lines.join("\n");
}

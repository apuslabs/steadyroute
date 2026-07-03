import { loadConfig } from "./config.js";
import { resolvePaths } from "./paths.js";

export function configPathRows(): Record<string, string> {
  const paths = resolvePaths();
  return {
    home: paths.home,
    config: paths.configPath,
    database: paths.dbPath,
    ledger: paths.dbPath,
    key_store: paths.dbPath,
    master_key: paths.masterKeyPath,
    runtime: paths.runtimePath,
    pid: paths.pidPath
  };
}

export function formatConfigPaths(rows: Record<string, string>): string {
  return Object.entries(rows).map(([name, value]) => `${name}: ${value}`).join("\n");
}

export function configShowRows(): Record<string, unknown> {
  const config = loadConfig();
  return {
    host: config.host,
    port: config.port,
    trace_full_bodies: config.traceFullBodies,
    catalog_path: config.catalogPath ?? "built-in only",
    provider_order: config.providerOrder
  };
}

export function formatConfigShow(rows: Record<string, unknown>): string {
  const providerOrder = Array.isArray(rows.provider_order) ? rows.provider_order.join(", ") : String(rows.provider_order ?? "");
  return [
    `host: ${rows.host}`,
    `port: ${rows.port}`,
    `trace_full_bodies: ${rows.trace_full_bodies}`,
    `catalog_path: ${rows.catalog_path}`,
    `provider_order: ${providerOrder}`
  ].join("\n");
}

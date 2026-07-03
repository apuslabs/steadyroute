import type Database from "better-sqlite3";
import { nanoid } from "nanoid";
import { loadConfig } from "./config.js";
import { addProviderKey, listProviderKeys } from "./db.js";
import { buildDoctorReport } from "./doctor.js";
import { providerById, PROVIDERS, resolveProviderEnvKey } from "./providers.js";
import { routeRequest } from "./router.js";

export interface ProviderListRow {
  id: string;
  display_name: string;
  status: string;
  auth_method: string;
  key_required: boolean;
  models: number;
  keyless: boolean;
}

export interface ProviderAuthOptions {
  alias?: string;
  value?: string;
}

export interface ProviderTestOptions {
  model?: string;
  json?: boolean;
}

export function providerListRows(): ProviderListRow[] {
  return PROVIDERS.map((provider) => ({
    id: provider.id,
    display_name: provider.displayName,
    status: provider.status,
    auth_method: provider.auth.method,
    key_required: provider.auth.required,
    models: provider.models.length,
    keyless: provider.auth.method === "anonymous" || !provider.auth.required
  }));
}

export function formatProviderList(rows: ProviderListRow[]): string {
  return rows.map((row) => `${row.id}\tstatus=${row.status}\tauth=${row.auth_method}\tmodels=${row.models}`).join("\n");
}

export async function providerStatusRows(db: Database.Database, providerId: string | null, probe: boolean): Promise<Array<Record<string, unknown>>> {
  const report = await buildDoctorReport(db, probe);
  const rows = report.providers;
  return providerId ? rows.filter((row) => row.provider === providerId) : rows;
}

export function formatProviderStatus(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "No matching providers.";
  const lines: string[] = [];
  for (const row of rows) {
    lines.push(`${row.provider}: status=${row.status} key_present=${row.key_present} source=${row.key_source} connectivity=${JSON.stringify(row.connectivity)}`);
    if (row.human_action) lines.push(`  human_action: ${row.human_action}`);
    const health = row.health && typeof row.health === "object" ? row.health as Record<string, unknown> : {};
    const cooldowns = Array.isArray(health.active_cooldowns) ? health.active_cooldowns as Array<Record<string, unknown>> : [];
    const failures = Array.isArray(health.recent_failures) ? health.recent_failures as Array<Record<string, unknown>> : [];
    if (cooldowns.length > 0) lines.push(`  active_cooldowns=${cooldowns.length}`);
    if (failures.length > 0) lines.push(`  recent_failures=${failures.length}`);
    const models = Array.isArray(row.models) ? row.models as Array<Record<string, unknown>> : [];
    for (const model of models) lines.push(`  model ${model.id}`);
  }
  return lines.join("\n");
}

export function providerAuth(db: Database.Database, providerId: string, options: ProviderAuthOptions = {}): string {
  const provider = providerById(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  if (provider.auth.method === "anonymous") {
    return `${provider.id}: no auth required. This provider uses SteadyRoute's anonymous/keyless route metadata.`;
  }

  const alias = options.alias ?? "default";
  if (options.value && options.value.trim()) {
    addProviderKey(db, provider.id, alias, options.value.trim());
    return `Stored encrypted key for ${provider.id}/${alias}`;
  }

  const envKey = resolveProviderEnvKey(provider);
  const stored = listProviderKeys(db).filter((key) => key.provider === provider.id);
  if (envKey.present) return `${provider.id}: auth available from ${envKey.source} (${envKey.alias}); secret value not shown.`;
  if (stored.length > 0) return `${provider.id}: auth available from encrypted key store aliases: ${stored.map((key) => key.alias).join(", ")}`;

  const lines = [`${provider.id}: auth not configured.`];
  if (provider.auth.env.length > 0) lines.push(`Set one of: ${provider.auth.env.join(", ")}`);
  if (provider.auth.method === "gh_token") lines.push("Or run: gh auth login");
  lines.push(`Or store a key with: steadyroute keys add ${provider.id}`);
  if (provider.auth.humanAction) lines.push(`Human action: ${provider.auth.humanAction}`);
  return lines.join("\n");
}

export async function runProviderSmokeTest(db: Database.Database, providerId: string, options: ProviderTestOptions = {}): Promise<Record<string, unknown>> {
  const provider = providerById(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);
  const model = options.model ?? provider.models[0]?.id;
  if (!model) throw new Error(`Provider has no configured models: ${providerId}`);
  const requestId = `provtest_${nanoid(12)}`;
  const config = loadConfig();
  const result = await routeRequest({
    requestId,
    db,
    endpoint: "/v1/chat/completions",
    method: "POST",
    body: {
      model: `steadyroute:${provider.id}/${model}`,
      messages: [{ role: "user", content: "Return exactly: provider smoke ok" }],
      max_tokens: 24,
      temperature: 0
    },
    headers: {
      "user-agent": "steadyroute-cli/providers-test",
      "x-steadyroute-provider-allowlist": provider.id
    },
    traceFullBodies: config.traceFullBodies,
    providerOrder: [provider.id]
  });
  const bodyText = await result.response.text();
  return {
    provider: provider.id,
    model,
    request_id: requestId,
    ok: result.response.status >= 200 && result.response.status < 300,
    http_status: result.response.status,
    explain_command: `steadyroute explain ${requestId}`,
    response_body: parseJsonOrText(bodyText)
  };
}

export function formatProviderTestResult(result: Record<string, unknown>): string {
  return [
    `Provider test ${result.provider}/${result.model}`,
    `Status: ${result.ok ? "success" : "failed"} (HTTP ${result.http_status})`,
    `Request id: ${result.request_id}`,
    `Explain: ${result.explain_command}`
  ].join("\n");
}

function parseJsonOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

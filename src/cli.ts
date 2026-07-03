#!/usr/bin/env node
import { createRequire } from "node:module";
import process from "node:process";
import { Command } from "commander";
import { acceptanceScenarioListRows, buildAcceptanceAudit, buildAcceptanceCheck, buildAcceptanceStatus, formatAcceptanceAudit, formatAcceptanceCheck, formatAcceptanceInit, formatAcceptanceScenarioList, formatAcceptanceStatus, initAcceptanceRun } from "./acceptanceCommands.js";
import { loadConfig } from "./config.js";
import { configPathRows, configShowRows, formatConfigPaths, formatConfigShow } from "./configCommands.js";
import { exportDiagnostics } from "./diagnostics.js";
import { addProviderKey, listProviderKeys, openDb, removeProviderKey } from "./db.js";
import { buildDoctorReport, formatDoctor } from "./doctor.js";
import { explainRequest, explainRequestJson } from "./explain.js";
import { applyIntegration, formatIntegrationApply, formatIntegrationList, formatIntegrationRollback, integrationListRows, rollbackIntegration } from "./integrationCommands.js";
import { resolvePaths } from "./paths.js";
import { formatProviderList, formatProviderStatus, formatProviderTestResult, providerAuth, providerListRows, providerStatusRows, runProviderSmokeTest } from "./providerCommands.js";
import { PROVIDERS } from "./providers.js";
import { readRuntimeStatus, removeRuntimeState, writeRuntimeState } from "./runtime.js";
import { buildServer } from "./server.js";

const packageJson = createRequire(import.meta.url)("../package.json") as { version?: string };
const program = new Command();
program.name("steadyroute").description("Local-first free LLM router").version(packageJson.version ?? "0.0.0");

program
  .command("start")
  .description("Start the local SteadyRoute server")
  .option("--host <host>", "Bind host")
  .option("--port <port>", "Bind port", (value) => Number(value))
  .action(async (options) => {
    const db = openDb();
    const config = loadConfig();
    const host = options.host ?? config.host;
    const port = options.port ?? config.port;
    if (!isLocalHost(host)) {
      console.error(`Refusing non-local bind by default: ${host}`);
      process.exitCode = 2;
      return;
    }
    const app = buildServer({ db, host, port });
    await app.listen({ host, port });
    writeRuntimeState({ pid: process.pid, host, port, local_only: isLocalHost(host) });
    console.log(`steadyroute listening on http://${host}:${port}`);
    const paths = resolvePaths();
    console.log(`request ledger: ${paths.dbPath}`);
  });

program
  .command("stop")
  .description("Stop a background SteadyRoute server started in this user profile")
  .action(() => {
    const runtime = readRuntimeStatus();
    if (runtime.status === "not_running") {
      console.log("No steadyroute runtime file found.");
      return;
    }
    if (runtime.status === "stale") {
      removeRuntimeState();
      console.log(`Removed stale steadyroute runtime metadata: ${runtime.reason}`);
      return;
    }
    const pid = runtime.state.pid;
    try {
      process.kill(pid, "SIGTERM");
      removeRuntimeState();
      console.log(`Stopped steadyroute process ${pid}`);
    } catch (error) {
      console.error(`Could not stop process ${pid}: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  });

program
  .command("doctor")
  .description("Report local config, key, provider, model, and catalog state")
  .option("--json", "Emit JSON")
  .option("--no-probe", "Skip provider probe summaries")
  .action(async (options) => {
    const db = openDb();
    const report = await buildDoctorReport(db, options.probe !== false);
    console.log(options.json ? JSON.stringify(report, null, 2) : formatDoctor(report));
  });

program
  .command("models")
  .description("List SteadyRoute routeable models")
  .option("--json", "Emit JSON")
  .action((options) => {
    const models = [
      { id: "steadyroute:auto", provider: "steadyroute", provider_status: "verified", model: "auto", evidence: ["Local route policy alias; provider status is decided per selected upstream candidate."] },
      ...PROVIDERS.flatMap((provider) => provider.models.map((model) => ({
        id: `steadyroute:${provider.id}/${model.id}`,
        provider: provider.id,
        provider_status: provider.status,
        model: model.id,
        capabilities: model.capabilities,
        context_window: model.contextWindow,
        free_tier: model.freeTier,
        evidence: provider.evidence
      })))
    ];
    if (options.json) console.log(JSON.stringify(models, null, 2));
    else for (const model of models) console.log(`${model.id} provider=${model.provider} status=${model.provider_status ?? "n/a"}`);
  });

const configCommand = program.command("config").description("Inspect local configuration and state paths");
configCommand
  .command("paths")
  .description("Show local config, ledger, key store, and runtime paths")
  .option("--json", "Emit JSON")
  .action((options) => {
    const rows = configPathRows();
    if (options.json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    console.log(formatConfigPaths(rows));
  });

configCommand
  .command("show")
  .description("Show local SteadyRoute configuration")
  .option("--json", "Emit JSON")
  .action((options) => {
    const config = configShowRows();
    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }
    console.log(formatConfigShow(config));
  });

const keys = program.command("keys").description("Manage local provider keys");
keys
  .command("add <provider>")
  .description("Add or replace an encrypted provider key")
  .option("--alias <alias>", "Key alias", "default")
  .option("--value <value>", "Key value; if omitted, read from stdin")
  .action(async (provider, options) => {
    const value = options.value ?? await readStdin();
    if (!value.trim()) {
      console.error("No key value provided.");
      process.exitCode = 2;
      return;
    }
    const db = openDb();
    addProviderKey(db, provider, options.alias, value.trim());
    console.log(`Stored encrypted key for ${provider}/${options.alias}`);
  });

keys
  .command("list")
  .description("List locally stored provider key aliases without printing secrets")
  .option("--json", "Emit JSON")
  .action((options) => {
    const db = openDb();
    const rows = listProviderKeys(db);
    if (options.json) {
      console.log(JSON.stringify(rows, null, 2));
      return;
    }
    if (rows.length === 0) {
      console.log("No stored provider keys.");
      return;
    }
    for (const row of rows) {
      console.log(`${row.provider}/${row.alias}\tcreated=${row.created_at}\tupdated=${row.updated_at}`);
    }
  });

keys
  .command("remove <provider>")
  .alias("rm")
  .description("Remove a locally stored provider key alias")
  .option("--alias <alias>", "Key alias", "default")
  .action((provider, options) => {
    const db = openDb();
    const removed = removeProviderKey(db, provider, options.alias);
    if (!removed) {
      console.error(`No stored key found for ${provider}/${options.alias}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Removed stored key for ${provider}/${options.alias}`);
  });

const providers = program.command("providers").description("Inspect, auth, and test providers");
providers
  .command("list")
  .description("List provider catalog entries and auth modes")
  .option("--json", "Emit JSON")
  .action((options) => {
    const rows = providerListRows();
    console.log(options.json ? JSON.stringify(rows, null, 2) : formatProviderList(rows));
  });

providers
  .command("status [provider]")
  .description("Show provider key, status, model, and probe state")
  .option("--json", "Emit JSON")
  .option("--probe", "Include lightweight provider probe summaries")
  .action(async (provider, options) => {
    const db = openDb();
    const rows = await providerStatusRows(db, provider ?? null, Boolean(options.probe));
    console.log(options.json ? JSON.stringify(rows, null, 2) : formatProviderStatus(rows));
  });

providers
  .command("auth <provider>")
  .description("Show provider auth setup state, or store a provider key")
  .option("--alias <alias>", "Key alias", "default")
  .option("--value <value>", "Store this key value in the encrypted key store")
  .action((provider, options) => {
    const db = openDb();
    console.log(providerAuth(db, provider, options));
  });

providers
  .command("test <provider>")
  .description("Run a real provider smoke request through the local router and ledger")
  .option("--model <model>", "Provider model id to test")
  .option("--json", "Emit JSON")
  .action(async (provider, options) => {
    const db = openDb();
    const result = await runProviderSmokeTest(db, provider, options);
    console.log(options.json ? JSON.stringify(result, null, 2) : formatProviderTestResult(result));
    if (!result.ok) process.exitCode = 1;
  });

const diagnostics = program.command("diagnostics").description("Export local diagnostic bundles");
diagnostics
  .command("export")
  .description("Write a redacted diagnostics JSON bundle")
  .option("--output <path>", "Output JSON path")
  .option("--include-bodies", "Include full local request and response bodies")
  .option("--limit <count>", "Recent request count to include", (value) => Number(value), 50)
  .option("--probe", "Include lightweight provider probe summaries")
  .action(async (options) => {
    const db = openDb();
    const output = await exportDiagnostics(db, {
      outputPath: options.output,
      includeBodies: Boolean(options.includeBodies),
      limit: options.limit,
      probe: Boolean(options.probe)
    });
    console.log(`Exported diagnostics to ${output}`);
  });

const acceptance = program.command("acceptance").description("Inspect local MVP acceptance evidence");
acceptance
  .command("list")
  .description("List MVP acceptance scenarios, evidence file patterns, and audit signals")
  .option("--json", "Emit JSON")
  .action((options) => {
    const rows = acceptanceScenarioListRows();
    console.log(options.json ? JSON.stringify(rows, null, 2) : formatAcceptanceScenarioList(rows));
  });

acceptance
  .command("init")
  .description("Create a local acceptance evidence run directory and manifest")
  .option("--root <path>", "Acceptance evidence root", ".steadyroute-acceptance")
  .option("--run <name>", "Run directory name; defaults to a local timestamp")
  .option("--force", "Overwrite the run manifest if the run directory already exists")
  .option("--print-env", "Print only shell exports for the new run")
  .option("--json", "Emit JSON")
  .action((options) => {
    const result = initAcceptanceRun({ root: options.root, run: options.run, force: Boolean(options.force) });
    console.log(options.json ? JSON.stringify(result, null, 2) : formatAcceptanceInit(result, { printEnv: Boolean(options.printEnv) }));
  });

acceptance
  .command("status")
  .description("Summarize local acceptance evidence file presence without running providers")
  .option("--root <path>", "Acceptance evidence root", ".steadyroute-acceptance")
  .option("--run <name>", "Restrict evidence scan to one run directory under the evidence root")
  .option("--latest", "Restrict evidence scan to the newest run directory under the evidence root")
  .option("--json", "Emit JSON")
  .action((options) => {
    const report = buildAcceptanceStatus({ root: options.root, run: options.run, latest: Boolean(options.latest) });
    console.log(options.json ? JSON.stringify(report, null, 2) : formatAcceptanceStatus(report));
  });

acceptance
  .command("audit")
  .description("Audit local acceptance evidence signals without running providers")
  .option("--root <path>", "Acceptance evidence root", ".steadyroute-acceptance")
  .option("--run <name>", "Restrict evidence scan to one run directory under the evidence root")
  .option("--latest", "Restrict evidence scan to the newest run directory under the evidence root")
  .option("--json", "Emit JSON")
  .action((options) => {
    const report = buildAcceptanceAudit({ root: options.root, run: options.run, latest: Boolean(options.latest) });
    console.log(options.json ? JSON.stringify(report, null, 2) : formatAcceptanceAudit(report));
  });

acceptance
  .command("check")
  .description("Exit non-zero unless local acceptance evidence is ready for human review")
  .option("--root <path>", "Acceptance evidence root", ".steadyroute-acceptance")
  .option("--run <name>", "Restrict evidence scan to one run directory under the evidence root")
  .option("--latest", "Restrict evidence scan to the newest run directory under the evidence root")
  .option("--json", "Emit JSON")
  .action((options) => {
    const result = buildAcceptanceCheck({ root: options.root, run: options.run, latest: Boolean(options.latest) });
    console.log(options.json ? JSON.stringify(result, null, 2) : formatAcceptanceCheck(result));
    if (!result.ok) process.exitCode = 1;
  });

const integrations = program.command("integrations").description("Configure local client integrations");
integrations
  .command("list")
  .description("List available integrations")
  .option("--json", "Emit JSON")
  .action((options) => {
    const rows = integrationListRows();
    console.log(options.json ? JSON.stringify(rows, null, 2) : formatIntegrationList(rows));
  });

integrations
  .command("apply <integration>")
  .description("Generate local integration guidance without overwriting user config")
  .option("--dry-run", "Preview without writing the SteadyRoute integration artifact")
  .option("--json", "Emit JSON")
  .action((integration, options) => {
    const result = applyIntegration(integration, { dryRun: Boolean(options.dryRun) });
    console.log(options.json ? JSON.stringify(result, null, 2) : formatIntegrationApply(result));
  });

integrations
  .command("rollback <integration>")
  .description("Remove a SteadyRoute-generated integration artifact")
  .option("--json", "Emit JSON")
  .action((integration, options) => {
    const result = rollbackIntegration(integration);
    console.log(options.json ? JSON.stringify(result, null, 2) : formatIntegrationRollback(result));
  });

program
  .command("explain <requestId>")
  .description("Explain a recorded SteadyRoute request")
  .option("--json", "Emit JSON")
  .action((requestId, options) => {
    const db = openDb();
    console.log(options.json ? JSON.stringify(explainRequestJson(db, requestId), null, 2) : explainRequest(db, requestId));
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

function isLocalHost(host: string): boolean {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

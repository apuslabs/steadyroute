#!/usr/bin/env node
import process from "node:process";
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { addProviderKey, openDb } from "./db.js";
import { buildDoctorReport, formatDoctor } from "./doctor.js";
import { explainRequest } from "./explain.js";
import { resolvePaths } from "./paths.js";
import { PROVIDERS } from "./providers.js";
import { readRuntimeStatus, removeRuntimeState, writeRuntimeState } from "./runtime.js";
import { buildServer } from "./server.js";

const program = new Command();
program.name("steadyroute").description("Local-first free LLM router").version("0.1.0");

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

program
  .command("explain <requestId>")
  .description("Explain a recorded SteadyRoute request")
  .action((requestId) => {
    const db = openDb();
    console.log(explainRequest(db, requestId));
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

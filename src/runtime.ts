import fs from "node:fs";
import { z } from "zod";
import { ensureHome, resolvePaths } from "./paths.js";

const RuntimeStateSchema = z.object({
  pid: z.number().int().positive(),
  host: z.string(),
  port: z.number().int().positive(),
  local_only: z.boolean(),
  started_at: z.string()
});

export type RuntimeState = z.infer<typeof RuntimeStateSchema>;

export type RuntimeStatus =
  | { status: "running"; state: RuntimeState }
  | { status: "stale"; state: RuntimeState | null; reason: string }
  | { status: "not_running"; state: null };

export function writeRuntimeState(input: Omit<RuntimeState, "started_at">): void {
  const paths = ensureHome(resolvePaths());
  const state = RuntimeStateSchema.parse({
    ...input,
    started_at: new Date().toISOString()
  });
  fs.writeFileSync(paths.pidPath, `${state.pid}\n`, { mode: 0o600 });
  fs.writeFileSync(paths.runtimePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

export function removeRuntimeState(): void {
  const paths = ensureHome(resolvePaths());
  for (const file of [paths.pidPath, paths.runtimePath]) {
    try {
      fs.unlinkSync(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export function readRuntimeStatus(): RuntimeStatus {
  const paths = resolvePaths();
  if (!fs.existsSync(paths.runtimePath)) {
    return { status: "not_running", state: null };
  }

  let state: RuntimeState;
  try {
    state = RuntimeStateSchema.parse(JSON.parse(fs.readFileSync(paths.runtimePath, "utf8")));
  } catch (error) {
    return {
      status: "stale",
      state: null,
      reason: `runtime metadata is unreadable: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  if (!isProcessAlive(state.pid)) {
    return { status: "stale", state, reason: `process ${state.pid} is not running` };
  }
  return { status: "running", state };
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

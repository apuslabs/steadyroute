import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface SteadyRoutePaths {
  home: string;
  configPath: string;
  dbPath: string;
  masterKeyPath: string;
  pidPath: string;
  runtimePath: string;
}

export function resolvePaths(): SteadyRoutePaths {
  const home = process.env.STEADYROUTE_HOME || path.join(os.homedir(), ".steadyroute");
  return {
    home,
    configPath: path.join(home, "config.json"),
    dbPath: process.env.STEADYROUTE_DB_PATH || path.join(home, "steadyroute.sqlite"),
    masterKeyPath: path.join(home, "master-key"),
    pidPath: path.join(home, "steadyroute.pid"),
    runtimePath: path.join(home, "steadyroute.runtime.json")
  };
}

export function ensureHome(paths = resolvePaths()): SteadyRoutePaths {
  fs.mkdirSync(paths.home, { recursive: true, mode: 0o700 });
  return paths;
}

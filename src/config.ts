import fs from "node:fs";
import { z } from "zod";
import { ensureHome, resolvePaths } from "./paths.js";

const ConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().positive().default(3001),
  traceFullBodies: z.boolean().default(true),
  catalogPath: z.string().nullable().default("/Users/jax/Desktop/Apus/open-free-llm-catalog"),
  providerOrder: z.array(z.string()).default(["opencode_free", "kilo", "openrouter", "github_models", "groq", "gemini"])
});

export type SteadyRouteConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): SteadyRouteConfig {
  const paths = ensureHome(resolvePaths());
  if (!fs.existsSync(paths.configPath)) {
    const initial = ConfigSchema.parse({});
    fs.writeFileSync(paths.configPath, `${JSON.stringify(initial, null, 2)}\n`, { mode: 0o600 });
    return initial;
  }
  const raw = fs.readFileSync(paths.configPath, "utf8");
  return ConfigSchema.parse(JSON.parse(raw));
}

export function saveConfig(config: SteadyRouteConfig): void {
  const paths = ensureHome(resolvePaths());
  fs.writeFileSync(paths.configPath, `${JSON.stringify(ConfigSchema.parse(config), null, 2)}\n`, { mode: 0o600 });
}

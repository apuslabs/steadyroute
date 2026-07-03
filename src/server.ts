import Fastify from "fastify";
import type Database from "better-sqlite3";
import { loadConfig } from "./config.js";
import { getProviderKey } from "./db.js";
import { PROVIDERS, resolveProviderEnvKey } from "./providers.js";
import { createRequestId } from "./requestIds.js";
import { routeRequest } from "./router.js";

export interface ServerOptions {
  db: Database.Database;
  host?: string;
  port?: number;
}

export function buildServer(options: ServerOptions) {
  const app = Fastify({ logger: false });
  const config = loadConfig();
  const host = options.host ?? config.host;
  const port = options.port ?? config.port;

  app.get("/health", async () => ({
    ok: true,
    name: "steadyroute",
    host,
    port,
    local_only: host === "127.0.0.1" || host === "localhost" || host === "::1"
  }));

  app.get("/v1/models", async () => ({
    object: "list",
    data: [
      { id: "steadyroute:auto", object: "model", created: 0, owned_by: "steadyroute" },
      ...PROVIDERS.flatMap((provider) => provider.models.map((model) => ({
        id: `steadyroute:${provider.id}/${model.id}`,
        object: "model",
        created: 0,
        owned_by: provider.id,
        steadyroute: {
          provider: provider.id,
          provider_status: provider.status,
          model: model.id,
          capabilities: model.capabilities,
          context_window: model.contextWindow,
          free_tier: model.freeTier,
          evidence: provider.evidence,
          key_present: providerKeyPresent(options.db, provider.id)
        }
      })))
    ]
  }));

  app.post("/v1/chat/completions", async (request, reply) => {
    const requestId = createRequestId();
    const result = await routeRequest({
      requestId,
      db: options.db,
      endpoint: "/v1/chat/completions",
      method: request.method,
      body: request.body as Record<string, unknown>,
      headers: normalizeHeaders(request.headers),
      traceFullBodies: config.traceFullBodies,
      providerOrder: config.providerOrder
    });
    await sendResponse(reply, result.response);
    void result.metadataDone?.catch(() => undefined);
  });

  app.post("/v1/responses", async (request, reply) => {
    const requestId = createRequestId();
    const result = await routeRequest({
      requestId,
      db: options.db,
      endpoint: "/v1/responses",
      method: request.method,
      body: request.body as Record<string, unknown>,
      headers: normalizeHeaders(request.headers),
      traceFullBodies: config.traceFullBodies,
      providerOrder: config.providerOrder
    });
    await sendResponse(reply, result.response);
    void result.metadataDone?.catch(() => undefined);
  });

  return app;
}

async function sendResponse(reply: any, response: Response): Promise<void> {
  response.headers.forEach((value, key) => reply.header(key, value));
  reply.status(response.status);
  if (response.body) {
    return reply.send(response.body);
  }
  return reply.send(await response.text());
}

function normalizeHeaders(headers: Record<string, unknown>): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" || Array.isArray(value)) out[key.toLowerCase()] = value as string | string[];
  }
  return out;
}

function providerKeyPresent(db: Database.Database, providerId: string): boolean {
  const provider = PROVIDERS.find((candidate) => candidate.id === providerId);
  if (!provider) return false;
  if (resolveProviderEnvKey(provider).present) return true;
  return Boolean(getProviderKey(db, provider.id, "default"));
}

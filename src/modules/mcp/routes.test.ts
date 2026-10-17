import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApp, modules, type AppEnv } from "../../app.js";
import { createInMemoryTokenRepository } from "../../auth/in-memory-token-repository.js";
import type { TokenRepository } from "../../auth/token-repository.js";
import { createToken } from "../../auth/token-service.js";
import { MCP_PATH, MCP_SERVER_INFO, mcpModule } from "./routes.js";

interface TestApp {
  app: Hono<AppEnv>;
  tokens: TokenRepository;
}

function createTestApp(): TestApp {
  const tokens = createInMemoryTokenRepository();
  return {
    app: createApp({ db: { ready: () => Promise.resolve() }, tokens }),
    tokens,
  };
}

async function createMcpClient(app: Hono<AppEnv>, secret: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL(`http://localhost${MCP_PATH}`), {
    requestInit: { headers: { Authorization: `Bearer ${secret}` } },
    fetch: async (_url, init) => app.request(MCP_PATH, init),
  });
  const client = new Client({ name: "mcp-route-test", version: "1.0.0" });
  await client.connect(transport);
  return client;
}

const INITIALIZE_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

function initializeBody(): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "raw-test", version: "1.0.0" },
    },
  });
}

describe("MCP-эндпоинт /mcp", () => {
  it("без токена отвечает 401, инициализация не происходит", async () => {
    const { app } = createTestApp();

    const res = await app.request(MCP_PATH, {
      method: "POST",
      headers: INITIALIZE_HEADERS,
      body: initializeBody(),
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("GET без токена тоже отклоняется", async () => {
    const { app } = createTestApp();

    const res = await app.request(MCP_PATH, {
      headers: { accept: "text/event-stream" },
    });

    expect(res.status).toBe(401);
  });

  it("отозванный токен отклоняется", async () => {
    const { app, tokens } = createTestApp();
    const created = await createToken(tokens, "revoked-client");
    await tokens.revoke(created.token.id);

    const res = await app.request(MCP_PATH, {
      method: "POST",
      headers: { ...INITIALIZE_HEADERS, Authorization: `Bearer ${created.secret}` },
      body: initializeBody(),
    });

    expect(res.status).toBe(401);
  });

  it("initialize по протоколу MCP проходит с токеном", async () => {
    const { app, tokens } = createTestApp();
    const { secret } = await createToken(tokens, "mcp-client");

    const client = await createMcpClient(app, secret);

    expect(client.getServerVersion()).toEqual(MCP_SERVER_INFO);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("echo");
    await client.close();
  });

  it("echo вызывается через Streamable HTTP с корректными аргументами", async () => {
    const { app, tokens } = createTestApp();
    const { secret } = await createToken(tokens, "mcp-client");

    const client = await createMcpClient(app, secret);
    const result = await client.callTool({ name: "echo", arguments: { message: "pong" } });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: "pong" }]);
    await client.close();
  });

  it("при authDisabled=true initialize проходит без токена", async () => {
    const tokens = createInMemoryTokenRepository();
    const app = createApp({
      db: { ready: () => Promise.resolve() },
      tokens,
      authDisabled: true,
    });

    const res = await app.request(MCP_PATH, {
      method: "POST",
      headers: INITIALIZE_HEADERS,
      body: initializeBody(),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { result?: { serverInfo?: { name: string } } };
    expect(body.result?.serverInfo?.name).toBe(MCP_SERVER_INFO.name);
  });

  it("GET с токеном в stateless-режиме отвечает 405", async () => {
    const { app, tokens } = createTestApp();
    const { secret } = await createToken(tokens, "mcp-client");

    const res = await app.request(MCP_PATH, {
      headers: { accept: "text/event-stream", Authorization: `Bearer ${secret}` },
    });

    expect(res.status).toBe(405);
  });
});

describe("регистрация MCP-модуля в композиции", () => {
  it("mcpModule входит в состав модулей по умолчанию", () => {
    expect(modules).toContain(mcpModule);
  });

  it("композиция без mcpModule стартует без ошибок и отвечает /mcp 404", async () => {
    const app = createApp({
      db: { ready: () => Promise.resolve() },
      tokens: createInMemoryTokenRepository(),
      modules: modules.filter((module) => module !== mcpModule),
    });

    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/ready")).status).toBe(200);
    expect((await app.request("/api")).status).toBe(401);
    expect((await app.request("/doc")).status).toBe(200);

    const res = await app.request(MCP_PATH, {
      method: "POST",
      headers: INITIALIZE_HEADERS,
      body: initializeBody(),
    });
    expect(res.status).toBe(404);
  });
});

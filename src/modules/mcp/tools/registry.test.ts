import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { echoTool } from "./echo.js";
import { mcpTools, registerTools, type ToolDefinition } from "./registry.js";

async function connectClient(server: McpServer): Promise<Client> {
  const client = new Client({ name: "registry-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return client;
}

describe("реестр инструментов", () => {
  it("добавленный инструмент появляется в сервере", async () => {
    const probe: ToolDefinition<{ value: z.ZodNumber }> = {
      name: "probe",
      description: "инструмент для проверки реестра",
      inputSchema: { value: z.number() },
      handler({ value }) {
        return { content: [{ type: "text", text: String(value) }] };
      },
    };
    const server = new McpServer({ name: "registry-test-server", version: "0.0.0" });
    registerTools(server, [probe]);

    const client = await connectClient(server);
    const { tools } = await client.listTools();

    const registered = tools.find((tool) => tool.name === "probe");
    expect(registered?.description).toBe("инструмент для проверки реестра");
    expect(registered?.inputSchema).toMatchObject({
      type: "object",
      properties: { value: { type: "number" } },
      required: ["value"],
    });
    await client.close();
  });

  it("echo входит в реестр по умолчанию", () => {
    expect(mcpTools.map((tool) => tool.name)).toContain("echo");
  });
});

describe("инструмент echo", () => {
  it("вызов с корректными аргументами возвращает результат", async () => {
    const server = new McpServer({ name: "echo-test-server", version: "0.0.0" });
    registerTools(server, [echoTool]);
    const client = await connectClient(server);

    const result = await client.callTool({
      name: "echo",
      arguments: { message: "привет, MCP" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toEqual([{ type: "text", text: "привет, MCP" }]);
    await client.close();
  });

  it("вызов с некорректными аргументами помечает результат ошибкой валидации", async () => {
    const server = new McpServer({ name: "echo-test-server", version: "0.0.0" });
    registerTools(server, [echoTool]);
    const client = await connectClient(server);

    const result = await client.callTool({ name: "echo", arguments: { message: 42 } });

    expect(result.isError).toBe(true);
    await client.close();
  });
});

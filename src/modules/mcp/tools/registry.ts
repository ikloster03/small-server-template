import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { echoTool } from "./echo.js";

export interface ToolDefinition<Args extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: Args;
  handler(args: z.output<z.ZodObject<Args>>): CallToolResult | Promise<CallToolResult>;
}

export const mcpTools: readonly ToolDefinition[] = [echoTool];

export function registerTools(
  server: McpServer,
  tools: readonly ToolDefinition[] = mcpTools,
): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      (args) => tool.handler(args),
    );
  }
}

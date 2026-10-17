import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Hono } from "hono";
import type { AppModule, AppDeps, AppEnv } from "../../app.js";
import { bearerAuth } from "../../auth/bearer-auth.js";
import { mcpTools, registerTools } from "./tools/registry.js";

export const MCP_PATH = "/mcp";

export const MCP_SERVER_INFO = { name: "small-server-template", version: "1.0.0" };

const METHOD_NOT_ALLOWED_BODY = {
  jsonrpc: "2.0" as const,
  error: { code: -32000, message: "Method not allowed." },
  id: null,
};

export const mcpModule: AppModule = {
  register: (app: Hono<AppEnv>, deps: AppDeps) => {
    app.use(
      MCP_PATH,
      bearerAuth({ repository: deps.tokens, disabled: deps.authDisabled, logger: deps.logger }),
    );

    app.post(MCP_PATH, async (c) => {
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      const server = new McpServer(MCP_SERVER_INFO);
      server.server.onerror = (error: Error) => {
        deps.logger.error({ err: error }, "mcp server error");
      };
      transport.onerror = (error: Error) => {
        deps.logger.error({ err: error }, "mcp transport error");
      };
      registerTools(server, mcpTools);
      await server.connect(transport);
      try {
        return await transport.handleRequest(c.req.raw);
      } finally {
        await server.close();
        await transport.close();
      }
    });

    app.get(MCP_PATH, (c) => c.json(METHOD_NOT_ALLOWED_BODY, 405));
    app.delete(MCP_PATH, (c) => c.json(METHOD_NOT_ALLOWED_BODY, 405));
  },
};

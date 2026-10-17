import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { describeRoute, openAPIRouteHandler } from "hono-openapi";
import { pino } from "pino";
import type { AppEnv } from "./context.js";

export type { AppEnv };
import type { TokenRepository } from "./auth/token-repository.js";
import type { DbPool } from "./db/client.js";
import { requestLogger, type Logger } from "./logger.js";
import { requestId } from "./middleware/request-id.js";
import { apiModule } from "./modules/api/routes.js";
import { healthModule } from "./modules/health/routes.js";
import { mcpModule } from "./modules/mcp/routes.js";

export interface AppDeps {
  logger: Logger;
  db: Pick<DbPool, "ready">;
  tokens: TokenRepository;
  authDisabled: boolean;
}

export interface AppModule {
  register: (app: Hono<AppEnv>, deps: AppDeps) => void;
}

export const modules: AppModule[] = [healthModule, apiModule, mcpModule];

export const OPENAPI_SPEC_PATH = "/openapi.json";
export const DOC_PATH = "/doc";

export interface CreateAppOptions {
  logger?: Logger;
  db: AppDeps["db"];
  tokens: AppDeps["tokens"];
  authDisabled?: boolean;
  modules?: AppModule[];
}

export function createApp({
  logger = pino({ level: "silent" }),
  db,
  tokens,
  authDisabled = false,
  modules: appModules = modules,
}: CreateAppOptions): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const deps: AppDeps = { logger, db, tokens, authDisabled };
  app.use(requestId());
  app.use(requestLogger(logger));
  for (const module of appModules) {
    module.register(app, deps);
  }
  app.get(
    OPENAPI_SPEC_PATH,
    openAPIRouteHandler(app, {
      documentation: {
        info: {
          title: "small-server-template",
          version: "1.0.0",
          description: "API шаблона небольшого сервера на Hono",
        },
      },
    }),
  );
  app.get(
    DOC_PATH,
    describeRoute({
      summary: "Scalar UI",
      description: "Интерактивная документация API",
      responses: {
        200: { description: "HTML-страница Scalar UI", content: { "text/html": {} } },
      },
    }),
    Scalar({ url: OPENAPI_SPEC_PATH, pageTitle: "small-server-template" }),
  );
  return app;
}

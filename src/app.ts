import { Hono } from "hono";
import { pino } from "pino";
import type { AppEnv } from "./context.js";

export type { AppEnv };
import { requestLogger, type Logger } from "./logger.js";
import { requestId } from "./middleware/request-id.js";
import { healthModule } from "./modules/health/routes.js";

export interface AppModule {
  register: (app: Hono<AppEnv>) => void;
}

export const modules: AppModule[] = [healthModule];

export interface CreateAppOptions {
  logger?: Logger;
}

export function createApp({
  logger = pino({ level: "silent" }),
}: CreateAppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use(requestId());
  app.use(requestLogger(logger));
  for (const module of modules) {
    module.register(app);
  }
  return app;
}

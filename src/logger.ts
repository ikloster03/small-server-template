import type { MiddlewareHandler } from "hono";
import { pino } from "pino";
import type { Logger } from "pino";
import type { AppEnv } from "./context.js";
import type { Env } from "./env.js";

export type { Logger };

export function createLogger(env: Pick<Env, "LOG_LEVEL">): Logger {
  return pino({ level: env.LOG_LEVEL });
}

export function requestLogger(logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const start = Date.now();
    await next();
    logger.info(
      {
        requestId: c.get("requestId"),
        method: c.req.method,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - start,
      },
      "request completed",
    );
  };
}

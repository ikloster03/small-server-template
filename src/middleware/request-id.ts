import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "../context.js";

export const REQUEST_ID_HEADER = "x-request-id";

export function requestId(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const incoming = c.req.header(REQUEST_ID_HEADER)?.trim();
    const id = incoming && incoming.length > 0 ? incoming : randomUUID();
    c.set("requestId", id);
    await next();
    c.res.headers.set(REQUEST_ID_HEADER, id);
  };
}

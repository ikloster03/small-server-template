import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../context.js";
import type { Logger } from "../logger.js";
import { hashTokenSecret } from "./token-service.js";
import type { TokenRepository } from "./token-repository.js";

const BEARER_PATTERN = /^Bearer\s+(.+)$/i;

export const WWW_AUTHENTICATE_CHALLENGE = "Bearer";

export interface BearerAuthOptions {
  repository: TokenRepository;
  disabled?: boolean;
  logger?: Logger;
}

function unauthorized(c: Context<AppEnv>): Response {
  return c.json({ error: "unauthorized" }, 401, { "WWW-Authenticate": WWW_AUTHENTICATE_CHALLENGE });
}

export function bearerAuth({
  repository,
  disabled = false,
  logger,
}: BearerAuthOptions): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (disabled) {
      c.set("auth", { kind: "disabled" });
      await next();
      return;
    }

    const header = c.req.header("Authorization");
    const secret = header === undefined ? undefined : BEARER_PATTERN.exec(header)?.[1];
    if (secret === undefined) {
      return unauthorized(c);
    }

    const token = await repository.findActiveByHash(hashTokenSecret(secret));
    if (token === null) {
      return unauthorized(c);
    }

    c.set("auth", { kind: "token", id: token.id, name: token.name });
    repository.touchLastUsed(token.id).catch((error) => {
      logger?.warn({ err: error, tokenId: token.id }, "failed to update token last_used_at");
    });
    await next();
  };
}

import { createHash, randomBytes } from "node:crypto";
import type { TokenRecord, TokenRepository } from "./token-repository.js";

const SECRET_BYTES = 32;

export const TOKEN_PREFIX_LENGTH = 8;

export interface CreatedToken {
  token: TokenRecord;
  secret: string;
}

export function generateTokenSecret(): string {
  return randomBytes(SECRET_BYTES).toString("base64url");
}

export function hashTokenSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

export async function createToken(
  repository: TokenRepository,
  name: string,
): Promise<CreatedToken> {
  const secret = generateTokenSecret();
  const token = await repository.create({
    name,
    tokenHash: hashTokenSecret(secret),
    prefix: secret.slice(0, TOKEN_PREFIX_LENGTH),
  });
  return { token, secret };
}

export async function revokeToken(
  repository: TokenRepository,
  idOrName: string,
): Promise<TokenRecord | null> {
  const all = await repository.list();
  const target = all.find((token) => token.id === idOrName || token.name === idOrName);
  if (target === undefined) {
    return null;
  }
  return repository.revoke(target.id);
}

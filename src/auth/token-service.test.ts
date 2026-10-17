import { describe, expect, it } from "vitest";
import { createInMemoryTokenRepository } from "./in-memory-token-repository.js";
import { createToken, hashTokenSecret, revokeToken, TOKEN_PREFIX_LENGTH } from "./token-service.js";

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

describe("token service", () => {
  it("создаёт токен: секрет соответствует хэшу и prefix", async () => {
    const repository = createInMemoryTokenRepository();

    const { token, secret } = await createToken(repository, "ci");

    expect(BASE64URL_RE.test(secret)).toBe(true);
    expect(secret).toHaveLength(43); // base64url от 32 байт
    expect(token.name).toBe("ci");
    expect(token.tokenHash).toBe(hashTokenSecret(secret));
    expect(token.prefix).toBe(secret.slice(0, TOKEN_PREFIX_LENGTH));
    expect(token.revokedAt).toBeNull();
    expect(secret).not.toContain(token.tokenHash);
  });

  it("создаёт уникальные секреты", async () => {
    const repository = createInMemoryTokenRepository();

    const first = await createToken(repository, "a");
    const second = await createToken(repository, "b");

    expect(first.secret).not.toBe(second.secret);
  });

  it("отзывает токен по id и по имени", async () => {
    const repository = createInMemoryTokenRepository();
    const { token } = await createToken(repository, "ci");
    const other = await createToken(repository, "bot");

    const revokedById = await revokeToken(repository, token.id);
    const revokedByName = await revokeToken(repository, other.token.name);

    expect(revokedById?.revokedAt).toBeInstanceOf(Date);
    expect(revokedByName?.revokedAt).toBeInstanceOf(Date);
    expect(await repository.findActiveByHash(token.tokenHash)).toBeNull();
    expect(await repository.findActiveByHash(other.token.tokenHash)).toBeNull();
  });

  it("повторный отзыв возвращает тот же токен", async () => {
    const repository = createInMemoryTokenRepository();
    const { token } = await createToken(repository, "ci");

    const first = await revokeToken(repository, token.id);
    const second = await revokeToken(repository, token.name);

    expect(second?.id).toBe(first?.id);
    expect(second?.revokedAt).toEqual(first?.revokedAt);
  });

  it("возвращает null при отзыве неизвестного токена", async () => {
    const repository = createInMemoryTokenRepository();

    expect(await revokeToken(repository, "no-such-token")).toBeNull();
  });

  it("touchLastUsed обновляет last_used_at активного токена", async () => {
    const repository = createInMemoryTokenRepository();
    const { token } = await createToken(repository, "ci");

    await repository.touchLastUsed(token.id);

    const [row] = await repository.list();
    expect(row?.lastUsedAt).toBeInstanceOf(Date);
  });
});

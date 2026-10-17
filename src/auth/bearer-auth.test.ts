import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../context.js";
import { bearerAuth } from "./bearer-auth.js";
import { createInMemoryTokenRepository } from "./in-memory-token-repository.js";
import { createToken, revokeToken } from "./token-service.js";
import type { TokenRepository } from "./token-repository.js";

function createTestApp(repository: TokenRepository, disabled = false): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.use("/api/*", bearerAuth({ repository, disabled }));
  app.get("/api", (c) => {
    const auth = c.get("auth");
    return c.json({ caller: auth.kind === "token" ? auth.name : "disabled" });
  });
  return app;
}

describe("bearerAuth", () => {
  let repository: TokenRepository;

  beforeEach(() => {
    repository = createInMemoryTokenRepository();
  });

  it("возвращает 401 и WWW-Authenticate без заголовка Authorization", async () => {
    const app = createTestApp(repository);

    const res = await app.request("/api");

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("возвращает 401 для схемы без секрета и не-Bearer схем", async () => {
    const app = createTestApp(repository);

    const empty = await app.request("/api", { headers: { Authorization: "Bearer " } });
    expect(empty.status).toBe(401);
    expect(empty.headers.get("WWW-Authenticate")).toBe("Bearer");

    const basic = await app.request("/api", { headers: { Authorization: "Basic dXNlcjpwYXNz" } });
    expect(basic.status).toBe(401);
  });

  it("возвращает 401 для невалидного секрета", async () => {
    const app = createTestApp(repository);
    await createToken(repository, "ci");

    const res = await app.request("/api", {
      headers: { Authorization: "Bearer not-a-real-secret" },
    });

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("возвращает 401 для отозванного токена", async () => {
    const app = createTestApp(repository);
    const { token, secret } = await createToken(repository, "ci");
    await revokeToken(repository, token.id);

    const res = await app.request("/api", { headers: { Authorization: `Bearer ${secret}` } });

    expect(res.status).toBe(401);
  });

  it("пропускает валидный токен и обновляет last_used_at", async () => {
    const touchLastUsed = vi.fn(repository.touchLastUsed.bind(repository));
    const app = createTestApp({ ...repository, touchLastUsed });
    const { token, secret } = await createToken(repository, "ci");

    const res = await app.request("/api", { headers: { Authorization: `Bearer ${secret}` } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ caller: "ci" });
    await vi.waitFor(() => {
      expect(touchLastUsed).toHaveBeenCalledWith(token.id);
    });
  });

  it("принимает схему bearer в нижнем регистре", async () => {
    const app = createTestApp(repository);
    const { secret } = await createToken(repository, "ci");

    const res = await app.request("/api", { headers: { Authorization: `bearer ${secret}` } });

    expect(res.status).toBe(200);
  });

  it("при disabled пропускает запросы без токена", async () => {
    const app = createTestApp(repository, true);

    const res = await app.request("/api");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ caller: "disabled" });
  });
});

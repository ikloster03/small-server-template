import { describe, expect, it, vi } from "vitest";
import { createApp, DOC_PATH, OPENAPI_SPEC_PATH } from "./app.js";
import { createInMemoryTokenRepository } from "./auth/in-memory-token-repository.js";
import { createToken } from "./auth/token-service.js";
import { REQUEST_ID_HEADER } from "./middleware/request-id.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function testDependencies(overrides: Partial<Parameters<typeof createApp>[0]> = {}) {
  return {
    db: { ready: () => Promise.resolve() },
    tokens: createInMemoryTokenRepository(),
    ...overrides,
  };
}

describe("GET /health", () => {
  it("отвечает 200", async () => {
    const app = createApp(testDependencies());
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("возвращает сгенерированный x-request-id", async () => {
    const res = await createApp(testDependencies()).request("/health");
    expect(res.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_RE);
  });
});

describe("GET /ready", () => {
  it("отвечает 200 при живой БД", async () => {
    const ready = vi.fn().mockResolvedValue(undefined);
    const app = createApp(testDependencies({ db: { ready } }));

    const res = await app.request("/ready");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(ready).toHaveBeenCalledTimes(1);
  });

  it("отвечает 503 при падающей проверке БД", async () => {
    const ready = vi.fn().mockRejectedValue(new Error("connection refused"));
    const app = createApp(testDependencies({ db: { ready } }));

    const res = await app.request("/ready");

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error" });
    expect(ready).toHaveBeenCalledTimes(1);
  });
});

describe("OpenAPI и Scalar UI", () => {
  it("в спецификации присутствуют /health и /ready", async () => {
    const app = createApp(testDependencies());

    const res = await app.request(OPENAPI_SPEC_PATH);

    expect(res.status).toBe(200);
    const spec = (await res.json()) as { paths: Record<string, unknown> };
    expect(Object.keys(spec.paths)).toContain("/health");
    expect(Object.keys(spec.paths)).toContain("/ready");
    expect(spec.paths[OPENAPI_SPEC_PATH]).toBeUndefined();
  });

  it("отдаёт Scalar UI на /doc", async () => {
    const app = createApp(testDependencies());

    const res = await app.request(DOC_PATH);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain(OPENAPI_SPEC_PATH);
  });
});

describe("API-слот под bearer-middleware", () => {
  it("требует токен: без Authorization — 401", async () => {
    const app = createApp(testDependencies());

    const res = await app.request("/api");

    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
  });

  it("пропускает валидный токен", async () => {
    const tokens = createInMemoryTokenRepository();
    const { secret } = await createToken(tokens, "ci");
    const app = createApp(testDependencies({ tokens }));

    const res = await app.request("/api", { headers: { Authorization: `Bearer ${secret}` } });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "защищённый API-слот", caller: "ci" });
  });

  it("маршруты /health, /ready и /doc доступны без токена", async () => {
    const app = createApp(testDependencies());

    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/ready")).status).toBe(200);
    expect((await app.request(DOC_PATH)).status).toBe(200);
  });

  it("при authDisabled=true маршрут /api отвечает без токена", async () => {
    const app = createApp(testDependencies({ authDisabled: true }));

    const res = await app.request("/api");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "защищённый API-слот", caller: "auth-disabled" });
  });

  it("в спецификации присутствует /api", async () => {
    const app = createApp(testDependencies());

    const res = await app.request(OPENAPI_SPEC_PATH);
    const spec = (await res.json()) as { paths: Record<string, unknown> };

    expect(Object.keys(spec.paths)).toContain("/api");
  });
});

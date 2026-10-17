import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "../context.js";
import { REQUEST_ID_HEADER, requestId } from "./request-id.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createTestApp() {
  const app = new Hono<AppEnv>();
  app.use(requestId());
  app.get("/ping", (c) => c.json({ requestId: c.get("requestId") }));
  return app;
}

describe("request-id middleware", () => {
  it("генерирует x-request-id при отсутствии заголовка и кладёт в контекст", async () => {
    const res = await createTestApp().request("/ping");
    const headerId = res.headers.get(REQUEST_ID_HEADER);
    expect(headerId).toMatch(UUID_RE);
    const body = (await res.json()) as { requestId: string };
    expect(body.requestId).toBe(headerId);
  });

  it("переиспользует присланный x-request-id", async () => {
    const res = await createTestApp().request("/ping", {
      headers: { [REQUEST_ID_HEADER]: "client-id-123" },
    });
    expect(res.headers.get(REQUEST_ID_HEADER)).toBe("client-id-123");
  });

  it("генерирует новый идентификатор для пустого заголовка", async () => {
    const res = await createTestApp().request("/ping", {
      headers: { [REQUEST_ID_HEADER]: "  " },
    });
    expect(res.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_RE);
  });
});

import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { REQUEST_ID_HEADER } from "./middleware/request-id.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("GET /health", () => {
  it("отвечает 200", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("возвращает сгенерированный x-request-id", async () => {
    const res = await createApp().request("/health");
    expect(res.headers.get(REQUEST_ID_HEADER)).toMatch(UUID_RE);
  });
});

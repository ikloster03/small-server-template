import { describe, expect, it } from "vitest";
import { createDb } from "./client.js";

describe("createDb", () => {
  it("экспонирует операцию закрытия пула", async () => {
    const pool = createDb({ DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app" });

    expect(pool.db).toBeDefined();
    expect(typeof pool.close).toBe("function");
    await expect(pool.close()).resolves.toBeUndefined();
  });
});

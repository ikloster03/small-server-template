import { describe, expect, it } from "vitest";
import { createDb } from "../src/db/client.js";
describe("mini", () => {
  it("открывает :memory:", async () => {
    const pool = createDb({ DATABASE_PATH: ":memory:" });
    await pool.ready();
    pool.sqlite.close();
    expect(true).toBe(true);
  });
});

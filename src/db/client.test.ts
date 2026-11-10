import { describe, expect, it } from "vitest";
import { createDb } from "./client.js";

describe("createDb", () => {
  it("экспонирует операции закрытия и проверки готовности", async () => {
    const pool = createDb({ DATABASE_PATH: ":memory:" });

    expect(pool.db).toBeDefined();
    expect(typeof pool.close).toBe("function");
    expect(typeof pool.ready).toBe("function");
    await expect(pool.ready()).resolves.toBeUndefined();
    await expect(pool.close()).resolves.toBeUndefined();
  });

  it("включает WAL и busy_timeout при открытии", () => {
    const path = new URL("../../.tmp-test-db/pragmas.db", import.meta.url).pathname;
    const pool = createDb({ DATABASE_PATH: path });
    const mode = pool.sqlite.query("PRAGMA journal_mode").get() as Record<string, string>;
    const timeout = pool.sqlite.query("PRAGMA busy_timeout").get() as Record<string, number>;
    expect(mode.journal_mode.toLowerCase()).toBe("wal");
    expect(timeout.timeout).toBe(5000);
    pool.sqlite.close();
  });

  it("создаёт каталог и файл базы по указанному пути", () => {
    const path = new URL("../../.tmp-test-db/app.db", import.meta.url).pathname;
    const pool = createDb({ DATABASE_PATH: path });
    pool.sqlite.close();
    expect(() => {
      const check = createDb({ DATABASE_PATH: path });
      check.sqlite.close();
    }).not.toThrow();
  });

  it("падает, когда каталог — это файл (ENOTDIR)", () => {
    expect(() => createDb({ DATABASE_PATH: "/etc/hosts/app.db" })).toThrow();
  });
});

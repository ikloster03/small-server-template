// Шим протокола bun:sqlite для vitest/vite: vite не умеет резолвить протокол bun:,
// а рантайм тестов — Node. Класс повторяет API Bun.Database (exec/prepare/query/
// transaction/close), которого достаточно драйверу drizzle bun-sqlite и коду клиента.
import { DatabaseSync } from "node:sqlite";

export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

export class Database {
  private readonly inner: DatabaseSync;

  constructor(path: string, _options?: { create?: boolean }) {
    this.inner = new DatabaseSync(path, { open: true });
  }

  exec(sql: string): void {
    this.inner.exec(sql);
  }

  prepare(sql: string): SqliteStatement {
    return this.inner.prepare(sql) as unknown as SqliteStatement;
  }

  query(sql: string): SqliteStatement {
    return this.prepare(sql);
  }

  transaction<T>(fn: () => T): T {
    this.inner.exec("BEGIN");
    try {
      const result = fn();
      this.inner.exec("COMMIT");
      return result;
    } catch (error) {
      this.inner.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.inner.close();
  }
}

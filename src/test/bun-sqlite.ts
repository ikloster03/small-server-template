// Шим протокола bun:sqlite для vitest/vite: vite не умеет резолвить протокол bun:,
// а рантайм тестов — Node. Класс повторяет API Bun.Database (exec/prepare/query/
// transaction/close), которого достаточно драйверу drizzle bun-sqlite и коду клиента.
import { DatabaseSync } from "node:sqlite";

export interface SqliteStatement {
  run(...params: unknown[]): unknown;
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  values(...params: unknown[]): unknown[];
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
    const stmt = this.inner.prepare(sql) as unknown as {
      run(...params: unknown[]): unknown;
      get(...params: unknown[]): unknown;
      all(...params: unknown[]): unknown[];
      iterate(...params: unknown[]): IterableIterator<unknown>;
    };
    return {
      run: (...params) => stmt.run(...params),
      get: (...params) => stmt.get(...params),
      all: (...params) => stmt.all(...params),
      // Bun Statement.values() возвращает строки-массивы; drizzle мапит поля позиционно.
      values: (...params) =>
        [...stmt.iterate(...params)].map((row) => Object.values(row as Record<string, unknown>)),
    };
  }

  query(sql: string): SqliteStatement {
    return this.prepare(sql);
  }

  // Bun Database.transaction(fn) возвращает callable с вариантами
  // deferred/immediate/exclusive — drizzle вызывает один из них.
  transaction<T>(fn: () => T): (() => T) & { deferred(): T; immediate(): T; exclusive(): T } {
    const run = (mode: string): T => {
      this.inner.exec(`BEGIN ${mode}`);
      try {
        const result = fn();
        this.inner.exec("COMMIT");
        return result;
      } catch (error) {
        this.inner.exec("ROLLBACK");
        throw error;
      }
    };
    const main = (() => run("DEFERRED")) as (() => T) & {
      deferred(): T;
      immediate(): T;
      exclusive(): T;
    };
    main.deferred = () => run("DEFERRED");
    main.immediate = () => run("IMMEDIATE");
    main.exclusive = () => run("EXCLUSIVE");
    return main;
  }

  close(): void {
    this.inner.close();
  }
}

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type { Env } from "../env.js";
import * as schema from "./schema/index.js";

export interface DbPool {
  sqlite: Database;
  db: BunSQLiteDatabase<typeof schema>;
  close: () => Promise<void>;
  ready: () => Promise<void>;
}

const PRAGMAS = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA busy_timeout = 5000",
  "PRAGMA foreign_keys = ON",
] as const;

export function createDb(env: Pick<Env, "DATABASE_PATH">): DbPool {
  const path = env.DATABASE_PATH;
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path, { create: true });
  for (const pragma of PRAGMAS) {
    sqlite.exec(pragma);
  }
  const db = drizzle(sqlite, { schema });
  return {
    sqlite,
    db,
    close: async () => {
      sqlite.close();
    },
    ready: async () => {
      sqlite.query("select 1").get();
    },
  };
}

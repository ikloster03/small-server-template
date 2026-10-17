import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Env } from "../env.js";
import * as schema from "./schema/index.js";

export interface DbPool {
  sql: postgres.Sql;
  db: PostgresJsDatabase<typeof schema>;
  close: () => Promise<void>;
  ready: () => Promise<void>;
}

export function createDb(env: Pick<Env, "DATABASE_URL">): DbPool {
  const sql = postgres(env.DATABASE_URL);
  const db = drizzle(sql, { schema });
  return {
    sql,
    db,
    close: () => sql.end({ timeout: 5 }),
    ready: async () => {
      await sql`select 1`;
    },
  };
}

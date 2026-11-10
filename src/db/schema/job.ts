import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const jobs = sqliteTable(
  "jobs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    kind: text("kind").notNull(),
    payload: text("payload").notNull().default("{}"),
    status: text("status").notNull().default("pending"),
    runAt: integer("run_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("jobs_status_run_at_idx").on(table.status, table.runAt)],
);

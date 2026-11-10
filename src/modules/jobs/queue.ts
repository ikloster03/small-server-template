import { and, asc, eq, lte, sql } from "drizzle-orm";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import type * as schema from "../../db/schema/index.js";
import { jobs } from "../../db/schema/job.js";

export type JobDatabase = BunSQLiteDatabase<typeof schema>;

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface JobRecord {
  id: string;
  kind: string;
  payload: unknown;
  status: JobStatus;
  runAt: Date;
  attempts: number;
  createdAt: Date;
}

export interface EnqueueOptions {
  kind: string;
  payload?: unknown;
  runAt?: Date;
}

export interface JobsQueue {
  enqueue(options: EnqueueOptions): Promise<JobRecord>;
  claimNext(now?: Date): Promise<JobRecord | null>;
  markDone(id: string): Promise<void>;
  markFailed(id: string, maxAttempts: number, baseDelayMs: number, now?: Date): Promise<JobStatus>;
  list(limit?: number): Promise<JobRecord[]>;
}

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 1_000;

function toRecord(row: typeof jobs.$inferSelect): JobRecord {
  return {
    id: row.id,
    kind: row.kind,
    payload: JSON.parse(row.payload) as unknown,
    status: row.status as JobStatus,
    runAt: row.runAt,
    attempts: row.attempts,
    createdAt: row.createdAt,
  };
}

export function createJobsQueue(db: JobDatabase): JobsQueue {
  return {
    async enqueue({ kind, payload = {}, runAt = new Date() }): Promise<JobRecord> {
      const [row] = await db
        .insert(jobs)
        .values({ kind, payload: JSON.stringify(payload), runAt })
        .returning();
      if (row === undefined) {
        throw new Error("не удалось поставить задачу в очередь");
      }
      return toRecord(row);
    },

    async claimNext(now = new Date()): Promise<JobRecord | null> {
      const claimed = db.transaction((tx) => {
        const [candidate] = tx
          .select()
          .from(jobs)
          .where(and(eq(jobs.status, "pending"), lte(jobs.runAt, now)))
          .orderBy(asc(jobs.runAt))
          .limit(1)
          .all();
        if (candidate === undefined) {
          return undefined;
        }
        return tx
          .update(jobs)
          .set({ status: "running" })
          .where(and(eq(jobs.id, candidate.id), eq(jobs.status, "pending")))
          .returning()
          .all()[0];
      });
      return claimed === undefined ? null : toRecord(claimed);
    },

    async markDone(id: string): Promise<void> {
      await db.update(jobs).set({ status: "done" }).where(eq(jobs.id, id));
    },

    async markFailed(id, maxAttempts, baseDelayMs, now = new Date()): Promise<JobStatus> {
      const nextAttempts = sql`${jobs.attempts} + 1`;
      const [row] = await db
        .update(jobs)
        .set({
          status: sql`case when ${jobs.attempts} + 1 >= ${maxAttempts} then 'failed' else 'pending' end`,
          attempts: nextAttempts,
          runAt: sql`${Math.floor(now.getTime() / 1000)} + ${baseDelayMs} * (1 << (${jobs.attempts} + 1))`,
        })
        .where(eq(jobs.id, id))
        .returning();
      return row === undefined ? "failed" : (row.status as JobStatus);
    },

    async list(limit = 100): Promise<JobRecord[]> {
      const rows = await db.select().from(jobs).limit(limit);
      return rows.map(toRecord);
    },
  };
}

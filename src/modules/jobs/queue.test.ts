import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../../db/client.js";
import type { DbPool } from "../../db/client.js";
import { createJobsQueue } from "./queue.js";

const migrationsFolder = new URL("../../../drizzle", import.meta.url).pathname;

const pools: DbPool[] = [];

function makeQueue() {
  const dir = mkdtempSync(join(tmpdir(), "jobs-test-"));
  const pool = createDb({ DATABASE_PATH: join(dir, "app.db") });
  pools.push(pool);
  migrate(pool.db, { migrationsFolder });
  return createJobsQueue(pool.db);
}

afterEach(() => {
  for (const pool of pools.splice(0)) {
    pool.sqlite.close();
  }
});

describe("jobs queue", () => {
  it("ставит задачу со статусом pending и payload", async () => {
    const queue = makeQueue();

    const job = await queue.enqueue({ kind: "send-email", payload: { to: "a@b.c" } });

    expect(job.status).toBe("pending");
    expect(job.kind).toBe("send-email");
    expect(job.payload).toEqual({ to: "a@b.c" });
    expect(job.attempts).toBe(0);
    const all = await queue.list();
    expect(all).toHaveLength(1);
  });

  it("атомарно отдаёт задачу одному получателю", async () => {
    const queue = makeQueue();
    await queue.enqueue({ kind: "a" });

    const first = await queue.claimNext();
    const second = await queue.claimNext();

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });

  it("не отдаёт отложенную задачу до наступления run_at", async () => {
    const queue = makeQueue();
    await queue.enqueue({ kind: "a", runAt: new Date(Date.now() + 60_000) });

    expect(await queue.claimNext()).toBeNull();

    const late = new Date(Date.now() + 120_000);
    const job = await queue.claimNext(late);
    expect(job).not.toBeNull();
    expect(job?.kind).toBe("a");
  });

  it("помечает выполненную задачу как done", async () => {
    const queue = makeQueue();
    const created = await queue.enqueue({ kind: "a" });
    const job = await queue.claimNext();

    await queue.markDone(job!.id);

    const all = await queue.list();
    expect(all[0]?.status).toBe("done");
    expect(all[0]?.id).toBe(created.id);
  });

  it("при ошибке возвращает задачу на повтор с нарастающей задержкой", async () => {
    const queue = makeQueue();
    const created = await queue.enqueue({ kind: "a" });
    const job = await queue.claimNext();

    const status = await queue.markFailed(job!.id, 3, 10);
    const afterFirst = (await queue.list())[0]!;
    expect(status).toBe("pending");
    expect(afterFirst.attempts).toBe(1);
    expect(afterFirst.runAt.getTime()).toBeGreaterThan(created.runAt.getTime());

    // backoff уважается: сразу задача не поднимается
    expect(await queue.claimNext()).toBeNull();

    // вторая ошибка: задержка больше первой
    const again = await queue.claimNext(new Date(Date.now() + 60_000));
    await queue.markFailed(again!.id, 3, 10);
    const afterSecond = (await queue.list())[0]!;
    expect(afterSecond.attempts).toBe(2);
    expect(afterSecond.runAt.getTime()).toBeGreaterThan(afterFirst.runAt.getTime());
  });

  it("после исчерпания попыток задача уходит в failed", async () => {
    const queue = makeQueue();
    await queue.enqueue({ kind: "a" });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const job = await queue.claimNext(new Date(Date.now() + 300_000));
      expect(job).not.toBeNull();
      const status = await queue.markFailed(job!.id, 3, 10);
      if (attempt === 2) {
        expect(status).toBe("failed");
      }
    }

    const final = (await queue.list())[0]!;
    expect(final.status).toBe("failed");
    expect(final.attempts).toBe(3);
    expect(await queue.claimNext(new Date(Date.now() + 300_000))).toBeNull();
  });
});

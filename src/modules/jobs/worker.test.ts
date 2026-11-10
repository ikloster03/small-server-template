import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../app.js";
import { createInMemoryTokenRepository } from "../../auth/in-memory-token-repository.js";
import { createDb } from "../../db/client.js";
import type { DbPool } from "../../db/client.js";
import { pino } from "pino";
import { createJobsQueue } from "./queue.js";
import { createJobsWorker, type JobHandlers } from "./worker.js";

const migrationsFolder = new URL("../../../drizzle", import.meta.url).pathname;

const pools: DbPool[] = [];

function makeWorker(handlers: JobHandlers = {}) {
  const dir = mkdtempSync(join(tmpdir(), "worker-test-"));
  const pool = createDb({ DATABASE_PATH: join(dir, "app.db") });
  pools.push(pool);
  migrate(pool.db, { migrationsFolder });
  const queue = createJobsQueue(pool.db);
  return { queue, worker: createJobsWorker(queue, handlers, { intervalMs: 20 }) };
}

afterEach(() => {
  for (const pool of pools.splice(0)) {
    pool.sqlite.close();
  }
});

describe("jobs worker", () => {
  it("выполняет задачу подходящим обработчиком", async () => {
    const handler = vi.fn();
    const { queue, worker } = makeWorker({ "log-example": handler });

    await queue.enqueue({ kind: "log-example", payload: { hello: "мир" } });
    const processed = await worker.tick();

    expect(processed).toBe(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      { hello: "мир" },
      expect.objectContaining({ kind: "log-example" }),
    );
    const all = await queue.list();
    expect(all[0]?.status).toBe("done");
  });

  it("возвращает 0, когда очередь пуста", async () => {
    const { worker } = makeWorker();
    expect(await worker.tick()).toBe(0);
  });

  it("при ошибке обработчика увеличивает attempts и продолжает работать", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("boom"));
    const healthy = vi.fn();
    const { queue, worker } = makeWorker({ failing, ok: healthy });

    await queue.enqueue({ kind: "failing" });
    await worker.tick();

    const after = (await queue.list())[0]!;
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(1);

    // воркер не упал: другая задача обрабатывается тем же тиком
    await queue.enqueue({ kind: "ok" });
    await worker.tick();
    expect(healthy).toHaveBeenCalledTimes(1);
  });

  it("задача без обработчика помечается ошибкой и уходит на повтор", async () => {
    const { queue, worker } = makeWorker({});

    await queue.enqueue({ kind: "unknown-kind" });
    await worker.tick();

    const after = (await queue.list())[0]!;
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(1);
  });

  it("start/stop гоняет тики по интервалу", async () => {
    const handler = vi.fn();
    const { queue, worker } = makeWorker({ ticked: handler });

    worker.start();
    await queue.enqueue({ kind: "ticked" });
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1), { timeout: 2_000 });
    worker.stop();

    const ticksAfterStop = handler.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(handler.mock.calls.length).toBe(ticksAfterStop);
  });
});

describe("модульность очереди", () => {
  it("приложение без модуля очереди работает без изменений", async () => {
    const app = createApp({
      logger: pino({ level: "silent" }),
      db: { ready: async () => {} },
      tokens: createInMemoryTokenRepository(),
    });

    const health = await app.request("/health");
    const ready = await app.request("/ready");

    expect(health.status).toBe(200);
    expect(ready.status).toBe(200);
  });
});

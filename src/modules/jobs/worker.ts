import type { Logger } from "../../logger.js";
import { DEFAULT_BASE_DELAY_MS, DEFAULT_MAX_ATTEMPTS, type JobsQueue } from "./queue.js";

export type JobHandler = (
  payload: unknown,
  job: { id: string; kind: string; attempts: number },
) => Promise<void> | void;

export interface JobHandlers {
  [kind: string]: JobHandler;
}

export interface JobsWorkerOptions {
  intervalMs?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
  logger?: Logger;
}

export interface JobsWorker {
  tick(): Promise<number>;
  start(): void;
  stop(): void;
}

const DEFAULT_INTERVAL_MS = 1_000;

export function createJobsWorker(
  queue: JobsQueue,
  handlers: JobHandlers,
  options: JobsWorkerOptions = {},
): JobsWorker {
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const logger = options.logger;
  let timer: ReturnType<typeof setInterval> | undefined;

  async function processOne(): Promise<number> {
    const job = await queue.claimNext();
    if (job === null) {
      return 0;
    }
    const handler = handlers[job.kind];
    if (handler === undefined) {
      logger?.warn({ jobId: job.id, kind: job.kind }, "job handler not found");
      await queue.markFailed(job.id, maxAttempts, baseDelayMs);
      return 1;
    }
    try {
      await handler(job.payload, job);
      await queue.markDone(job.id);
      logger?.debug({ jobId: job.id, kind: job.kind }, "job done");
    } catch (error) {
      logger?.warn({ err: error, jobId: job.id, kind: job.kind }, "job failed");
      await queue.markFailed(job.id, maxAttempts, baseDelayMs).catch(() => {});
    }
    return 1;
  }

  return {
    tick: processOne,

    start(): void {
      if (timer !== undefined) {
        return;
      }
      timer = setInterval(() => {
        void processOne();
      }, intervalMs);
    },

    stop(): void {
      if (timer !== undefined) {
        clearInterval(timer);
        timer = undefined;
      }
    },
  };
}

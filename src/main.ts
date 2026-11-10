import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { createApp } from "./app.js";
import { createDrizzleTokenRepository } from "./auth/drizzle-token-repository.js";
import { createDb } from "./db/client.js";
import { loadEnv } from "./env.js";
import { startServer, type HttpServerHandle } from "./http-server.js";
import { createLogger } from "./logger.js";
import { createJobsQueue, createJobsWorker, type JobsWorker } from "./modules/jobs/index.js";
import { enableGracefulShutdown } from "./shutdown.js";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export interface BootstrapHandle {
  server: HttpServerHandle;
  jobs: JobsWorker;
  disposeSignalHandlers: () => void;
}

export function createJobHandlers(logger: ReturnType<typeof createLogger>) {
  return {
    // Пример обработчика: замените своими видами задач.
    "log-example": (payload: unknown) => {
      logger.info({ payload }, "example job executed");
    },
  };
}

export async function bootstrap(): Promise<BootstrapHandle> {
  const env = loadEnv();
  const logger = createLogger(env);
  const pool = createDb(env);
  try {
    migrate(pool.db, { migrationsFolder });
  } catch (error) {
    logger.error({ err: error }, "migrations failed");
    await pool.close().catch(() => {});
    process.exit(1);
  }
  const jobsQueue = createJobsQueue(pool.db);
  const jobsWorker = createJobsWorker(jobsQueue, createJobHandlers(logger), { logger });
  const app = createApp({
    logger,
    db: pool,
    tokens: createDrizzleTokenRepository(pool.db),
    authDisabled: env.AUTH_DISABLED,
  });
  const server = startServer(app, env.PORT, (port) => {
    logger.info({ port }, "server listening");
  });
  jobsWorker.start();
  const disposeSignalHandlers = enableGracefulShutdown({
    logger,
    server,
    closePool: () => {
      jobsWorker.stop();
      return pool.close();
    },
  });
  return { server, jobs: jobsWorker, disposeSignalHandlers };
}

if (process.env.VITEST === undefined) {
  bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

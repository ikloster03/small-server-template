import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createApp } from "./app.js";
import { createDb } from "./db/client.js";
import { loadEnv } from "./env.js";
import { createLogger } from "./logger.js";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

export async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env);
  const pool = createDb(env);
  try {
    await migrate(pool.db, { migrationsFolder });
  } catch (error) {
    logger.error({ err: error }, "migrations failed");
    await pool.close().catch(() => {});
    process.exit(1);
  }
  const app = createApp({ logger });
  serve({ fetch: app.fetch, port: env.PORT }, (info) => {
    logger.info({ port: info.port }, "server listening");
  });
}

if (process.env.VITEST === undefined) {
  bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

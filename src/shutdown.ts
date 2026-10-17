import type { Logger } from "./logger.js";

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export const SHUTDOWN_SIGNALS = ["SIGTERM", "SIGINT"] as const;

export interface CloseableServer {
  close: (callback?: (err?: Error | undefined) => void) => void;
}

export interface GracefulShutdownOptions {
  logger: Logger;
  server: CloseableServer;
  closePool: () => Promise<void>;
  timeoutMs?: number;
  exit?: (code: number) => void;
}

export function gracefulShutdown({
  logger,
  server,
  closePool,
  timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS,
  exit = (code) => process.exit(code),
}: GracefulShutdownOptions): Promise<void> {
  logger.info({ timeoutMs }, "graceful shutdown started");
  return new Promise((resolve) => {
    const forceExit = setTimeout(() => {
      logger.error({ timeoutMs }, "graceful shutdown timed out, forcing exit");
      exit(1);
      resolve();
    }, timeoutMs);

    server.close((serverError) => {
      if (serverError) {
        logger.warn({ err: serverError }, "server close reported error");
      }
      closePool()
        .then(() => {
          clearTimeout(forceExit);
          logger.info("shutdown complete");
          exit(0);
          resolve();
        })
        .catch((poolError) => {
          clearTimeout(forceExit);
          logger.error({ err: poolError }, "pool close failed");
          exit(1);
          resolve();
        });
    });
  });
}

export function enableGracefulShutdown(options: GracefulShutdownOptions): () => void {
  let shuttingDown = false;
  const listeners = new Map<NodeJS.Signals, () => void>();
  for (const signal of SHUTDOWN_SIGNALS) {
    const listener = () => {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      void gracefulShutdown(options);
    };
    process.on(signal, listener);
    listeners.set(signal, listener);
  }
  return () => {
    for (const [signal, listener] of listeners) {
      process.removeListener(signal, listener);
    }
  };
}

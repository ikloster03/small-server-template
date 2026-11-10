import type { Hono } from "hono";
import type { AppEnv } from "./context.js";

export interface HttpServerHandle {
  port: number;
  close: (callback?: (err?: Error | undefined) => void) => void;
}

export function startServer(
  app: Hono<AppEnv>,
  port: number,
  onListening?: (port: number) => void,
): HttpServerHandle {
  const server = Bun.serve({ fetch: app.fetch, port });
  const actualPort = server.port ?? port;
  onListening?.(actualPort);
  return {
    port: actualPort,
    close: (callback) => {
      try {
        server.stop(false);
        void Promise.resolve(server.pendingRequests)
          .then(() => callback?.())
          .catch((error: Error) => callback?.(error));
      } catch (error) {
        callback?.(error as Error);
      }
    },
  };
}

import { describeRoute, resolver } from "hono-openapi";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppModule, AppDeps, AppEnv } from "../../app.js";

const healthResponse = z.object({ status: z.literal("ok") });
const readyResponse = z.object({ status: z.enum(["ok", "error"]) });

export const healthModule: AppModule = {
  register: (app: Hono<AppEnv>, deps: AppDeps) => {
    app.get(
      "/health",
      describeRoute({
        summary: "Liveness-проба",
        description: "Отвечает 200, пока процесс жив. БД не используется.",
        tags: ["health"],
        responses: {
          200: {
            description: "Процесс жив",
            content: { "application/json": { schema: resolver(healthResponse) } },
          },
        },
      }),
      (c) => c.json({ status: "ok" }),
    );

    app.get(
      "/ready",
      describeRoute({
        summary: "Readiness-проба",
        description: "Проверяет доступность БД запросом `SELECT 1` через пул соединений.",
        tags: ["health"],
        responses: {
          200: {
            description: "БД доступна",
            content: { "application/json": { schema: resolver(readyResponse) } },
          },
          503: {
            description: "БД недоступна",
            content: { "application/json": { schema: resolver(readyResponse) } },
          },
        },
      }),
      async (c) => {
        try {
          await deps.db.ready();
          return c.json({ status: "ok" }, 200);
        } catch {
          return c.json({ status: "error" }, 503);
        }
      },
    );
  },
};

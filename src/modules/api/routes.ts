import { describeRoute, resolver } from "hono-openapi";
import type { Hono } from "hono";
import { z } from "zod";
import type { AppModule, AppDeps, AppEnv } from "../../app.js";
import { bearerAuth } from "../../auth/bearer-auth.js";

export const API_BASE_PATH = "/api";

const apiResponse = z.object({
  message: z.string(),
  caller: z.string(),
});

const unauthorizedResponse = z.object({ error: z.string() });

export const apiModule: AppModule = {
  register: (app: Hono<AppEnv>, deps: AppDeps) => {
    app.use(
      `${API_BASE_PATH}/*`,
      bearerAuth({ repository: deps.tokens, disabled: deps.authDisabled, logger: deps.logger }),
    );

    app.get(
      API_BASE_PATH,
      describeRoute({
        summary: "Защищённый API-слот",
        description:
          "Пример маршрута под bearer-middleware. Требует заголовок Authorization с активным токеном.",
        tags: ["api"],
        responses: {
          200: {
            description: "Доступ разрешён",
            content: { "application/json": { schema: resolver(apiResponse) } },
          },
          401: {
            description: "Токен отсутствует, невалиден или отозван",
            content: { "application/json": { schema: resolver(unauthorizedResponse) } },
          },
        },
      }),
      (c) => {
        const auth = c.get("auth");
        return c.json({
          message: "защищённый API-слот",
          caller: auth.kind === "token" ? auth.name : "auth-disabled",
        });
      },
    );
  },
};

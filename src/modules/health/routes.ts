import type { Hono } from "hono";
import type { AppModule, AppEnv } from "../../app.js";

export const healthModule: AppModule = {
  register: (app: Hono<AppEnv>) => {
    app.get("/health", (c) => c.json({ status: "ok" }));
  },
};

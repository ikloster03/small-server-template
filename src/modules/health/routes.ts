import type { Hono } from "hono";
import type { AppModule } from "../../app.js";

export const healthModule: AppModule = {
  register: (app: Hono) => {
    app.get("/health", (c) => c.json({ status: "ok" }));
  },
};

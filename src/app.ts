import { Hono } from "hono";
import { healthModule } from "./modules/health/routes.js";

export interface AppModule {
  register: (app: Hono) => void;
}

export const modules: AppModule[] = [healthModule];

export function createApp(): Hono {
  const app = new Hono();
  for (const module of modules) {
    module.register(app);
  }
  return app;
}

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      // vite не резолвит протокол bun:; drizzle-orm/bun-sqlite импортирует его в driver.js.
      // Под тестами заменяем на шим поверх node:sqlite.
      {
        find: /^bun:sqlite$/,
        replacement: fileURLToPath(new URL("./src/test/bun-sqlite.ts", import.meta.url)),
      },
      // сам драйвер экстернализуется, поэтому подменяем его локальной копией
      // без value-import "bun:sqlite"; migrator чистый — его не трогаем
      {
        find: /^drizzle-orm\/bun-sqlite$/,
        replacement: fileURLToPath(new URL("./src/test/drizzle-bun-sqlite.ts", import.meta.url)),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});

import { defineConfig } from "tsup";

export default defineConfig({
  entry: { main: "src/main.ts", token: "src/cli/token.ts" },
  format: ["esm"],
  target: "node24",
  platform: "node",
  sourcemap: true,
  clean: true,
});

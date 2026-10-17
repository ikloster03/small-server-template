import { z } from "zod";

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace", "silent"] as const;

export const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
      message: "должен быть URL PostgreSQL (postgres:// или postgresql://)",
    }),
  LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),
  AUTH_DISABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type Env = z.output<typeof envSchema>;

function formatEnvError(error: z.ZodError): string {
  const details = error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  return `Невалидные переменные окружения:\n${details}`;
}

export function loadEnv(raw: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) {
    return result.data;
  }
  console.error(formatEnvError(result.error));
  process.exit(1);
}

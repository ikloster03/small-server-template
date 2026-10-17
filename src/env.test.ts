import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { loadEnv } from "./env.js";

const validEnv = {
  PORT: "8080",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
  LOG_LEVEL: "debug",
  AUTH_DISABLED: "true",
};

describe("loadEnv", () => {
  let exitSpy: MockInstance<(code?: string | number | null | undefined) => never>;
  let errorSpy: MockInstance<(...args: unknown[]) => void>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("разбирает валидное окружение", () => {
    const env = loadEnv(validEnv);
    expect(env).toEqual({
      PORT: 8080,
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/app",
      LOG_LEVEL: "debug",
      AUTH_DISABLED: true,
    });
  });

  it("подставляет значения по умолчанию", () => {
    const env = loadEnv({ DATABASE_URL: "postgres://localhost:5432/app" });
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.AUTH_DISABLED).toBe(false);
  });

  it("завершает процесс при некорректном PORT с упоминанием переменной", () => {
    loadEnv({ ...validEnv, PORT: "not-a-number" });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("PORT"));
  });

  it("завершает процесс при отсутствии DATABASE_URL с упоминанием переменной", () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = validEnv;
    loadEnv(withoutDb);
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("DATABASE_URL"));
  });

  it("завершает процесс при невалидном LOG_LEVEL", () => {
    loadEnv({ ...validEnv, LOG_LEVEL: "verbose" });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("LOG_LEVEL"));
  });

  it("завершает процесс при значении AUTH_DISABLED вне true/false", () => {
    loadEnv({ ...validEnv, AUTH_DISABLED: "yes" });
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("AUTH_DISABLED"));
  });
});

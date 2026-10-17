import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serve: vi.fn(),
  migrate: vi.fn(),
  close: vi.fn(),
  ready: vi.fn(),
  createDb: vi.fn(),
  enableGracefulShutdown: vi.fn(),
}));

vi.mock("@hono/node-server", () => ({
  serve: mocks.serve,
}));

vi.mock("./db/client.js", () => ({
  createDb: mocks.createDb,
}));

vi.mock("drizzle-orm/postgres-js/migrator", () => ({
  migrate: mocks.migrate,
}));

vi.mock("./shutdown.js", () => ({
  enableGracefulShutdown: mocks.enableGracefulShutdown,
}));

const { bootstrap } = await import("./main.js");

describe("bootstrap", () => {
  beforeEach(() => {
    vi.stubEnv("PORT", "3000");
    vi.stubEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/app");
    vi.stubEnv("LOG_LEVEL", "silent");
    vi.stubEnv("AUTH_DISABLED", "false");
    mocks.createDb.mockReturnValue({ sql: {}, db: {}, close: mocks.close, ready: mocks.ready });
    mocks.migrate.mockReset();
    mocks.migrate.mockResolvedValue(undefined);
    mocks.serve.mockReset();
    mocks.serve.mockReturnValue({ close: vi.fn() });
    mocks.close.mockResolvedValue(undefined);
    mocks.close.mockClear();
    mocks.ready.mockReset();
    mocks.enableGracefulShutdown.mockReset();
    mocks.enableGracefulShutdown.mockReturnValue(vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("применяет миграции до открытия порта", async () => {
    await bootstrap();

    expect(mocks.migrate).toHaveBeenCalledTimes(1);
    expect(mocks.migrate).toHaveBeenCalledWith(expect.anything(), {
      migrationsFolder: expect.stringContaining("drizzle"),
    });
    expect(mocks.serve).toHaveBeenCalledTimes(1);
    expect(mocks.serve).toHaveBeenCalledWith(
      expect.objectContaining({ port: 3000 }),
      expect.any(Function),
    );
    expect(mocks.migrate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.serve.mock.invocationCallOrder[0],
    );
  });

  it("не открывает порт и выходит с кодом 1 при ошибке миграции", async () => {
    mocks.migrate.mockRejectedValue(new Error("migration failed"));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process exited");
    });

    await expect(bootstrap()).rejects.toThrow("process exited");

    expect(mocks.serve).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("подключает graceful shutdown с сервером и закрытием пула", async () => {
    const handle = await bootstrap();

    expect(mocks.enableGracefulShutdown).toHaveBeenCalledTimes(1);
    const options = mocks.enableGracefulShutdown.mock.calls[0][0];
    expect(options.server).toBe(mocks.serve.mock.results[0].value);
    expect(options.closePool).toBeTypeOf("function");

    await options.closePool();
    expect(mocks.close).toHaveBeenCalledTimes(1);

    expect(handle.disposeSignalHandlers).toBeTypeOf("function");
    handle.disposeSignalHandlers();
  });
});

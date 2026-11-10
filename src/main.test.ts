import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startServer: vi.fn(),
  migrate: vi.fn(),
  close: vi.fn(),
  ready: vi.fn(),
  createDb: vi.fn(),
  enableGracefulShutdown: vi.fn(),
}));

vi.mock("./http-server.js", () => ({
  startServer: mocks.startServer,
}));

vi.mock("./db/client.js", () => ({
  createDb: mocks.createDb,
}));

vi.mock("drizzle-orm/bun-sqlite/migrator", () => ({
  migrate: mocks.migrate,
}));

vi.mock("./shutdown.js", () => ({
  enableGracefulShutdown: mocks.enableGracefulShutdown,
}));

const { bootstrap } = await import("./main.js");

describe("bootstrap", () => {
  beforeEach(() => {
    vi.stubEnv("PORT", "3000");
    vi.stubEnv("DATABASE_PATH", "/tmp/app.db");
    vi.stubEnv("LOG_LEVEL", "silent");
    vi.stubEnv("AUTH_DISABLED", "false");
    mocks.createDb.mockReturnValue({ sqlite: {}, db: {}, close: mocks.close, ready: mocks.ready });
    mocks.migrate.mockReset();
    mocks.migrate.mockReturnValue(undefined);
    mocks.startServer.mockReset();
    mocks.startServer.mockReturnValue({ port: 3000, close: vi.fn() });
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
    expect(mocks.startServer).toHaveBeenCalledTimes(1);
    expect(mocks.startServer).toHaveBeenCalledWith(expect.anything(), 3000, expect.any(Function));
    expect(mocks.migrate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.startServer.mock.invocationCallOrder[0],
    );
  });

  it("не открывает порт и выходит с кодом 1 при ошибке миграции", async () => {
    mocks.migrate.mockImplementation(() => {
      throw new Error("migration failed");
    });
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process exited");
    });

    await expect(bootstrap()).rejects.toThrow("process exited");

    expect(mocks.startServer).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("подключает graceful shutdown с сервером и закрытием БД", async () => {
    const handle = await bootstrap();

    expect(mocks.enableGracefulShutdown).toHaveBeenCalledTimes(1);
    const options = mocks.enableGracefulShutdown.mock.calls[0][0];
    expect(options.server).toBe(mocks.startServer.mock.results[0].value);
    expect(options.closePool).toBeTypeOf("function");

    await options.closePool();
    expect(mocks.close).toHaveBeenCalledTimes(1);

    expect(handle.disposeSignalHandlers).toBeTypeOf("function");
    handle.disposeSignalHandlers();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pino } from "pino";
import {
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  SHUTDOWN_SIGNALS,
  enableGracefulShutdown,
  gracefulShutdown,
} from "./shutdown.js";

const logger = pino({ level: "silent" });

describe("gracefulShutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("останавливает сервер, затем пул, и выходит с кодом 0", async () => {
    const close = vi.fn((callback?: (err?: Error) => void) => callback?.());
    const closePool = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    await gracefulShutdown({ logger, server: { close }, closePool, exit });

    expect(close).toHaveBeenCalledTimes(1);
    expect(closePool).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
    expect(close.mock.invocationCallOrder[0]).toBeLessThan(closePool.mock.invocationCallOrder[0]);
    expect(closePool.mock.invocationCallOrder[0]).toBeLessThan(exit.mock.invocationCallOrder[0]);
  });

  it("выходит с кодом 1, если пул не закрылся", async () => {
    const close = vi.fn((callback?: (err?: Error) => void) => callback?.());
    const closePool = vi.fn().mockRejectedValue(new Error("pool stuck"));
    const exit = vi.fn();

    await gracefulShutdown({ logger, server: { close }, closePool, exit });

    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it("принудительно выходит по таймауту, если сервер не закрылся", async () => {
    const close = vi.fn();
    const closePool = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();

    const done = gracefulShutdown({ logger, server: { close }, closePool, exit, timeoutMs: 1_000 });

    await vi.advanceTimersByTimeAsync(999);
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(closePool).not.toHaveBeenCalled();
    await done;
  });

  it("использует таймаут по умолчанию", async () => {
    const close = vi.fn();
    const exit = vi.fn();

    const done = gracefulShutdown({ logger, server: { close }, closePool: vi.fn(), exit });

    await vi.advanceTimersByTimeAsync(DEFAULT_SHUTDOWN_TIMEOUT_MS - 1);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
    await done;
  });
});

describe("enableGracefulShutdown", () => {
  it("регистрирует и снимает обработчики SIGTERM и SIGINT", () => {
    const on = vi.spyOn(process, "on");
    const off = vi.spyOn(process, "removeListener");

    const dispose = enableGracefulShutdown({
      logger,
      server: { close: vi.fn() },
      closePool: vi.fn().mockResolvedValue(undefined),
    });

    for (const signal of SHUTDOWN_SIGNALS) {
      expect(on).toHaveBeenCalledWith(signal, expect.any(Function));
    }

    dispose();

    for (const signal of SHUTDOWN_SIGNALS) {
      expect(off).toHaveBeenCalledWith(signal, expect.any(Function));
    }

    on.mockRestore();
    off.mockRestore();
  });

  it("по сигналу запускает остановку один раз", async () => {
    const close = vi.fn((callback?: (err?: Error) => void) => callback?.());
    const closePool = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const handlers = new Map<string, () => void>();
    const on = vi
      .spyOn(process, "on")
      .mockImplementation((...args: Parameters<typeof process.on>) => {
        handlers.set(args[0] as string, args[1] as () => void);
        return process;
      });
    const off = vi.spyOn(process, "removeListener").mockImplementation(() => process);

    const dispose = enableGracefulShutdown({ logger, server: { close }, closePool, exit });
    const handler = handlers.get("SIGTERM");
    expect(handler).toBeTypeOf("function");
    handler?.();
    handler?.();

    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
    expect(closePool).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);

    dispose();
    on.mockRestore();
    off.mockRestore();
  });
});

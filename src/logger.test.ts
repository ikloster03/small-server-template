import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("создаёт логгер с уровнем из env", () => {
    expect(createLogger({ LOG_LEVEL: "debug" }).level).toBe("debug");
    expect(createLogger({ LOG_LEVEL: "warn" }).level).toBe("warn");
  });
});

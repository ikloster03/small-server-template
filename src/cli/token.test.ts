import { describe, expect, it } from "vitest";
import { createInMemoryTokenRepository } from "../auth/in-memory-token-repository.js";
import { hashTokenSecret } from "../auth/token-service.js";
import { runTokenCli } from "./token.js";

interface Captured {
  lines: string[];
  write: (line: string) => void;
}

function capture(): Captured {
  const lines: string[] = [];
  return { lines, write: (line) => lines.push(line) };
}

async function createTokenViaCli(
  repository: ReturnType<typeof createInMemoryTokenRepository>,
  name: string,
) {
  const out = capture();
  const code = await runTokenCli(["create", "--name", name], { repository, write: out.write });
  const labelIndex = out.lines.findIndex((line) => line.startsWith("Секрет"));
  return { code, out, secret: out.lines[labelIndex + 1] ?? null };
}

describe("token list", () => {
  it("показывает имя, prefix и статус без секретов", async () => {
    const repository = createInMemoryTokenRepository();
    const ci = await createTokenViaCli(repository, "ci");
    const bot = await createTokenViaCli(repository, "bot");
    await runTokenCli(["revoke", "bot"], { repository, write: () => {} });

    const out = capture();
    const code = await runTokenCli(["list"], { repository, write: out.write });

    expect(code).toBe(0);
    const table = out.lines.join("\n");
    expect(table).toContain("ci");
    expect(table).toContain("bot");
    expect(table).toContain("active");
    expect(table).toContain("revoked");
    expect(table).not.toContain(ci.secret ?? "ci-secret-missing");
    expect(table).not.toContain(bot.secret ?? "bot-secret-missing");
    expect(table).not.toContain(hashTokenSecret(ci.secret ?? ""));
  });

  it("выводит только заголовок при пустом списке", async () => {
    const repository = createInMemoryTokenRepository();
    const out = capture();

    const code = await runTokenCli(["list"], { repository, write: out.write });

    expect(code).toBe(0);
    expect(out.lines).toHaveLength(2);
    expect(out.lines[0]).toContain("NAME");
  });
});

describe("token create", () => {
  it("печатает секрет ровно один раз и хранит только хэш", async () => {
    const repository = createInMemoryTokenRepository();
    const out = capture();

    const code = await runTokenCli(["create", "--name", "ci"], { repository, write: out.write });

    expect(code).toBe(0);
    const [record] = await repository.list();
    expect(record?.name).toBe("ci");
    expect(record?.tokenHash).toBe(hashTokenSecret(out.lines[out.lines.length - 1] ?? ""));
    const secretOccurrences = out.lines.filter(
      (line) => line === out.lines[out.lines.length - 1],
    ).length;
    expect(secretOccurrences).toBe(1);
    expect(out.lines.join("\n")).not.toContain(record?.tokenHash ?? "hash-missing");
  });

  it("без --name возвращает код 1 и подсказку", async () => {
    const repository = createInMemoryTokenRepository();
    const out = capture();

    const code = await runTokenCli(["create"], { repository, write: out.write });

    expect(code).toBe(1);
    expect(out.lines[0]).toContain("--name");
  });
});

describe("token revoke", () => {
  it("отзывает токен по имени: токен перестаёт быть активным", async () => {
    const repository = createInMemoryTokenRepository();
    const { secret } = await createTokenViaCli(repository, "ci");
    const [record] = await repository.list();
    const out = capture();

    const code = await runTokenCli(["revoke", "ci"], { repository, write: out.write });

    expect(code).toBe(0);
    expect(out.lines[0]).toContain("отозван");
    expect(await repository.findActiveByHash(hashTokenSecret(secret ?? ""))).toBeNull();
    const [updated] = await repository.list();
    expect(updated?.revokedAt).toBeInstanceOf(Date);
    expect(updated?.id).toBe(record?.id);
  });

  it("отзывает токен по id", async () => {
    const repository = createInMemoryTokenRepository();
    await createTokenViaCli(repository, "ci");
    const [record] = await repository.list();

    const code = await runTokenCli(["revoke", record?.id ?? ""], { repository, write: () => {} });

    expect(code).toBe(0);
    const [updated] = await repository.list();
    expect(updated?.revokedAt).toBeInstanceOf(Date);
  });

  it("неизвестный токен — код 1", async () => {
    const repository = createInMemoryTokenRepository();
    const out = capture();

    const code = await runTokenCli(["revoke", "ghost"], { repository, write: out.write });

    expect(code).toBe(1);
    expect(out.lines[0]).toContain("не найден");
  });
});

describe("неизвестная команда", () => {
  it("печатает usage и возвращает код 1", async () => {
    const repository = createInMemoryTokenRepository();
    const out = capture();

    const code = await runTokenCli(["wrong"], { repository, write: out.write });

    expect(code).toBe(1);
    expect(out.lines[0]).toContain("Использование");
  });
});

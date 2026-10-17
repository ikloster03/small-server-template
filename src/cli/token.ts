import { createDrizzleTokenRepository } from "../auth/drizzle-token-repository.js";
import { createToken, revokeToken } from "../auth/token-service.js";
import type { TokenRecord, TokenRepository } from "../auth/token-repository.js";
import { createDb } from "../db/client.js";
import { loadEnv } from "../env.js";
import { createLogger } from "../logger.js";

const USAGE = `Управление bearer-токенами.

Использование:
  token list                     — список токенов (без секретов)
  token create --name <имя>      — создать токен, секрет печатается один раз
  token revoke <id|имя>          — отозвать токен`;

export interface TokenCliDeps {
  repository: TokenRepository;
  write?: (line: string) => void;
}

const SECRET_LABEL = "Секрет (показывается только один раз):";

function parseNameFlag(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--name") {
      return args[index + 1];
    }
    if (arg.startsWith("--name=")) {
      return arg.slice("--name=".length);
    }
  }
  return undefined;
}

function formatDate(date: Date | null): string {
  return date === null ? "-" : date.toISOString();
}

function formatStatus(token: TokenRecord): string {
  return token.revokedAt === null ? "active" : "revoked";
}

function printTable(write: (line: string) => void, tokens: TokenRecord[]): void {
  const header = ["NAME", "PREFIX", "STATUS", "CREATED_AT", "REVOKED_AT"];
  const rows = tokens.map((token) => [
    token.name,
    token.prefix,
    formatStatus(token),
    formatDate(token.createdAt),
    formatDate(token.revokedAt),
  ]);
  const widths = header.map((cell, column) =>
    Math.max(cell.length, ...rows.map((row) => row[column]?.length ?? 0)),
  );
  write(header.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  "));
  write(widths.map((width) => "-".repeat(width)).join("  "));
  for (const row of rows) {
    write(row.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join("  "));
  }
}

export async function runTokenCli(argv: string[], deps: TokenCliDeps): Promise<number> {
  const write = deps.write ?? ((line: string) => console.log(line));
  const [command = "", ...args] = argv;

  switch (command) {
    case "list": {
      const tokens = await deps.repository.list();
      printTable(write, tokens);
      return 0;
    }

    case "create": {
      const name = parseNameFlag(args);
      if (name === undefined || name.length === 0) {
        write("укажите имя токена: token create --name <имя>");
        return 1;
      }
      const { token, secret } = await createToken(deps.repository, name);
      write(`Токен создан: ${token.name} (id: ${token.id}, prefix: ${token.prefix})`);
      write(SECRET_LABEL);
      write(secret);
      return 0;
    }

    case "revoke": {
      const target = args[0];
      if (target === undefined || target.length === 0) {
        write("укажите токен: token revoke <id|имя>");
        return 1;
      }
      const token = await revokeToken(deps.repository, target);
      if (token === null) {
        write(`Токен не найден: ${target}`);
        return 1;
      }
      write(`Токен отозван: ${token.name} (id: ${token.id})`);
      return 0;
    }

    default: {
      write(USAGE);
      return 1;
    }
  }
}

export async function tokenCliMain(argv: string[]): Promise<number> {
  const env = loadEnv();
  const logger = createLogger(env);
  const pool = createDb(env);
  try {
    const repository = createDrizzleTokenRepository(pool.db);
    return await runTokenCli(argv, { repository });
  } finally {
    await pool.close().catch((error) => {
      logger.error({ err: error }, "failed to close database pool");
    });
  }
}

if (process.env.VITEST === undefined) {
  tokenCliMain(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

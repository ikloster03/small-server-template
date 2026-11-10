// @ts-nocheck
// Локальная копия drizzle-orm/bun-sqlite/driver.js без value-import "bun:sqlite".
// Локальная копия drizzle-orm/bun-sqlite/driver.js без value-import "bun:sqlite"
// (vite/node ESM-лоадер не умеет протокол bun:). Под Bun разницы нет: та же
// SQLiteBunSession и тот же construct(), клиент всегда передаётся готовый.
import { DefaultLogger } from "drizzle-orm/logger";
import { createTableRelationsHelpers, extractTablesRelationalConfig } from "drizzle-orm/relations";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core/db";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core/dialect";
import { isConfig } from "drizzle-orm/utils";
import { SQLiteBunSession } from "drizzle-orm/bun-sqlite/session";

class BunSQLiteDatabase extends BaseSQLiteDatabase {
  // entityKind опущён: он нужен только для isinstance-проверок внутри drizzle
}

function construct(client, config = {}) {
  const dialect = new SQLiteSyncDialect({ casing: config.casing });
  let logger;
  if (config.logger === true) {
    logger = new DefaultLogger();
  } else if (config.logger !== false) {
    logger = config.logger;
  }
  let schema;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
    schema = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    };
  }
  const session = new SQLiteBunSession(client, dialect, schema, { logger });
  const db = new BunSQLiteDatabase("sync", dialect, session, schema);
  db.$client = client;
  return db;
}

function drizzle(...params) {
  if (params[0] === undefined || typeof params[0] === "string") {
    throw new Error("тестовый шим drizzle принимает только готовый client");
  }
  if (isConfig(params[0])) {
    const { client, ...drizzleConfig } = params[0];
    if (client) return construct(client, drizzleConfig);
    throw new Error("тестовый шим drizzle требует client");
  }
  return construct(params[0], params[1]);
}

export { BunSQLiteDatabase, drizzle };

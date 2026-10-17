import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema/index.js";
import { tokens } from "../db/schema/token.js";
import type { CreateTokenInput, TokenRecord, TokenRepository } from "./token-repository.js";

export type TokenDatabase = PostgresJsDatabase<typeof schema>;

export function createDrizzleTokenRepository(db: TokenDatabase): TokenRepository {
  return {
    async list(): Promise<TokenRecord[]> {
      return db.select().from(tokens).orderBy(desc(tokens.createdAt));
    },

    async create(input: CreateTokenInput): Promise<TokenRecord> {
      const [row] = await db.insert(tokens).values(input).returning();
      if (row === undefined) {
        throw new Error("не удалось создать токен");
      }
      return row;
    },

    async revoke(id: string): Promise<TokenRecord | null> {
      const [row] = await db
        .update(tokens)
        .set({ revokedAt: sql`coalesce(${tokens.revokedAt}, now())` })
        .where(eq(tokens.id, id))
        .returning();
      return row ?? null;
    },

    async findActiveByHash(tokenHash: string): Promise<TokenRecord | null> {
      const [row] = await db
        .select()
        .from(tokens)
        .where(and(eq(tokens.tokenHash, tokenHash), isNull(tokens.revokedAt)))
        .limit(1);
      return row ?? null;
    },

    async touchLastUsed(id: string): Promise<void> {
      await db.update(tokens).set({ lastUsedAt: new Date() }).where(eq(tokens.id, id));
    },
  };
}

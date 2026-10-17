import type { CreateTokenInput, TokenRecord, TokenRepository } from "./token-repository.js";

export function createInMemoryTokenRepository(): TokenRepository {
  const rows: TokenRecord[] = [];
  let sequence = 0;

  const nextId = (): string => {
    sequence += 1;
    return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
  };

  const find = (id: string): TokenRecord | undefined => rows.find((row) => row.id === id);

  return {
    async list() {
      return rows.map((row) => ({ ...row }));
    },

    async create(input: CreateTokenInput) {
      const record: TokenRecord = {
        id: nextId(),
        ...input,
        createdAt: new Date(),
        revokedAt: null,
        lastUsedAt: null,
      };
      rows.push(record);
      return { ...record };
    },

    async revoke(id: string) {
      const row = find(id);
      if (row === undefined) {
        return null;
      }
      row.revokedAt ??= new Date();
      return { ...row };
    },

    async findActiveByHash(tokenHash: string) {
      const row = rows.find(
        (candidate) => candidate.tokenHash === tokenHash && candidate.revokedAt === null,
      );
      return row === undefined ? null : { ...row };
    },

    async touchLastUsed(id: string) {
      const row = find(id);
      if (row !== undefined) {
        row.lastUsedAt = new Date();
      }
    },
  };
}

export interface TokenRecord {
  id: string;
  name: string;
  tokenHash: string;
  prefix: string;
  createdAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
}

export interface CreateTokenInput {
  name: string;
  tokenHash: string;
  prefix: string;
}

export interface TokenRepository {
  list(): Promise<TokenRecord[]>;
  create(input: CreateTokenInput): Promise<TokenRecord>;
  revoke(id: string): Promise<TokenRecord | null>;
  findActiveByHash(tokenHash: string): Promise<TokenRecord | null>;
  touchLastUsed(id: string): Promise<void>;
}

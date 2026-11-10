# Этап 1: установка зависимостей (полные — для сборки).
FROM oven/bun:1 AS install
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Этап 2: сборка прод-бандла tsup.
FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY package.json tsconfig.json tsup.config.ts ./
COPY src ./src
RUN bun run build

# Этап 3: прод-зависимости без dev-зависимостей.
FROM oven/bun:1 AS install-production
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Этап 4: рантайм на Bun (бандл, миграции, прод-зависимости).
FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=bun:bun /app/dist ./dist
COPY --from=install-production --chown=bun:bun /app/node_modules ./node_modules
COPY --chown=bun:bun package.json ./package.json
COPY --chown=bun:bun drizzle ./drizzle
RUN mkdir -p /data && chown bun:bun /data
USER bun
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health || exit 1
CMD ["bun", "dist/main.js"]

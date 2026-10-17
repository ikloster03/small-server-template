# Этап 1: установка зависимостей на Bun ( Bun — только пакетный менеджер ).
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

# Этап 3: рантайм на Node.js ( только бандл, миграции и package.json ).
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node drizzle ./drizzle
COPY --chown=node:node package.json ./package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --retries=3 --start-period=30s \
  CMD wget -qO- http://127.0.0.1:${PORT:-3000}/health || exit 1
CMD ["node", "dist/main.js"]

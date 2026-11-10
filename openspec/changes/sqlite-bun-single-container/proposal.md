# Proposal: sqlite-bun-single-container

## Why

Шаблон нацелен на небольшие API/MCP-серверы (порядка 5 пользователей), но его самый тяжёлый компонент — контейнер PostgreSQL — даёт вторую службу, healthcheck-ожидание при старте и отдельный том ради нагрузки, которой на таком масштабе не будет. Встраиваемая БД и рантайм Bun убирают всё это, не меняя язык и кодовую базу (тот же TypeScript, Hono, Drizzle).

## What Changes

- **BREAKING**: PostgreSQL и драйвер `postgres.js` заменяются на SQLite через `bun:sqlite` + `drizzle-orm/bun-sqlite`; режим WAL, `busy_timeout`, `foreign_keys` включаются при открытии БД.
- **BREAKING**: переменная окружения `DATABASE_URL` (postgres://…) заменяется на `DATABASE_PATH` (путь к файлу, по умолчанию `/data/app.db`).
- **BREAKING**: рантайм Node.js заменяется на Bun: HTTP-сервер через `Bun.serve` вместо `@hono/node-server`, пакеты `postgres`, `@hono/node-server` удаляются.
- `docker-compose.yml` сокращается до одного сервиса `server`: без службы `db`, без `depends_on`-ожидания; том `/data` хранит файл БД. `compose.external-db.yml` удаляется.
- Dockerfile перестраивается на `oven/bun` (multi-stage, alpine), прод-стадия содержит бандл и миграции.
- Схема Drizzle адаптируется: `uuid().defaultRandom()` → `text().$defaultFn(crypto.randomUUID())`, `timestamp with timezone` → `integer({ mode: "timestamp" })`, SQL-функции Postgres (`now()`) заменяются значениями из кода.
- Миграции Drizzle (dialect `sqlite`) по-прежнему применяются программно при старте до открытия порта.
- Новая capability `background-jobs`: встроенная очередь задач на таблице в той же SQLite-базе — воркер в том же процессе, отложенные задачи, повторы с backoff.

## Capabilities

### New Capabilities

- `background-jobs` — фоновая обработка задач: постановка в очередь, отложенный запуск, повторы, статусная модель.

### Modified Capabilities

- `database` — вместо пула подключений к PostgreSQL: файл SQLite с WAL, миграции тем же контрактом (до открытия порта), закрытие при graceful shutdown.
- `container` — один контейнер вместо двух, рантайм-образ на Bun, том для файла БД.
- `server-core` — валидация окружения под `DATABASE_PATH` вместо `DATABASE_URL`; HTTP-сервер на `Bun.serve`.
- `token-auth` — хранение токенов в SQLite (контракт репозитория и модель данных не меняются).

## Impact

- Код: `src/db/client.ts`, `src/db/schema/token.ts`, `src/env.ts`, `src/main.ts`, `src/auth/drizzle-token-repository.ts` (SQL-специфика), `drizzle.config.ts`.
- Инфраструктура: `Dockerfile`, `docker-compose.yml` (удаляется `compose.external-db.yml`), `.env.example`.
- Зависимости: `− postgres`, `− @hono/node-server`; сборка/запуск через Bun.
- Документация: README (EN/RU) — разделы Quick start, env-таблица, упоминания Postgres.
- Ограничения (принимаются): один процесс-писатель, нет мультиинстанса на общий файл БД, очередь рассчитана на десятки задач/сек, не на тысячи.

## Context

Репозиторий — свежая копия `project-template`: есть commitlint + `.githooks`, релизы через changelogen (`release.yml`), OpenSpec и README EN/RU. Серверного кода нет. Эталон аутентификации и общей топологии — `ikloster03/timelog` (bearer-токены в Postgres, CLI в контейнере). Шаблон рассчитан на масштаб «small»: один процесс, один контейнер, статический bearer вместо OAuth.

## Goals / Non-Goals

**Goals:**

- `Use this template` → `docker compose up` → поднимаются Postgres и сервер; `/health` и `/ready` отвечают.
- Один процесс Hono: API-роуты, Scalar UI и MCP-эндпоинт (Streamable HTTP) в одном приложении.
- Модули изолированы; отключение модуля — правка одной строки в композиционном файле (`src/app.ts`).
- Миграции применяются при старте; порт открывается только после их завершения.
- Auth как в timelog: bearer-токены в Postgres, секрет виден один раз, CLI внутри контейнера.
- Прод-рантайм — Node.js в node-alpine с бандлом; Bun — только пакетный менеджер и dev-скрипты.
- CI: typecheck + линт + формат + тесты + сборка Docker-образа.

**Non-Goals:**

- Генератор проектов, ветки-варианты, кастомизация состава модулей при создании репозитория.
- OAuth 2.1 / динамическая регистрация клиентов MCP — только статический bearer (в README — заметка про OAuth для публичных серверов).
- stdio-транспорт MCP (регистратура транспорт-агностична — задел, не реализация).
- Код бота; в README — только паттерн вебхука поверх того же сервера.
- Кластеризация, несколько реплик, очередь задач.

## Decisions

### D1. Топология приложения: один Hono-инстанс и композиционный файл

`src/app.ts` — единственное место сборки: создаёт Hono-приложение, вешает request-id и логирование, OpenAPI, и регистрирует модули из массива `modules` (health — всегда; `api`, `mcp` — по одной строке на модуль). Отключение MCP — удаление/комментирование одной строки массива. Модуль — самодостаточная функция `register(app, { db, logger, ... })`, не импортирующая другие модули. Альтернатива — nest-style DI — отвергнута: лишний вес для small-масштаба.

### D2. Стек и запуск

- TypeScript (strict), Hono на Node-адаптере (`@hono/node-server`).
- env через zod: `src/env.ts` парсит `PORT`, `DATABASE_URL`, `LOG_LEVEL`, `AUTH_DISABLED` (для локальной разработки); невалидный env — процесс падает сразу с понятной ошибкой (fail-fast), до открытия порта.
- pino: базовый логгер + middleware, который читает/генерирует `x-request-id`, кладёт в контекст и пишет во все записи запроса.
- Dev — `tsx watch`, prod — `tsup`-бандл (ESM, target node24, external: встроенные модули Node). Два entry: `src/main.ts` (сервер) и `src/cli/token.ts` (CLI).
- Пакетный менеджер — Bun (bun.lock, `bun install --frozen-lockfile`). Bun не используется как рантайм в проде: только install и dev-скрипты. Альтернатива npm/pnpm — медленнее установка в CI и Docker.

### D3. Порядок старта: миграции до открытия порта

`src/main.ts`: parse env → создать пул → `migrate()` из `drizzle-orm/postgres-js/migrator` → `serve(...)` → лог «listening». Любой сбой на шагах до serve — выход с кодом 1 без открытия порта. Graceful shutdown по SIGTERM/SIGINT: остановить `server.close()` (ждать незавершённые запроси), затем `sql.end()` пула, с таймаутом принудительного выхода. Альтернатива — применять миграции отдельным job'ом в compose — отвергнута: усложняет шаблон, для одной реплики достаточно.

Готовность: `/health` — liveness (отвечает, пока жив процесс), `/ready` — readiness (проверяет `SELECT 1` через пул; 503 при недоступной БД).

### D4. БД: Drizzle + postgres.js

- `drizzle-orm` + драйвер `postgres` (postgres.js): пул `max` из env, prepared-запросы по умолчанию.
- Схема в `src/db/schema/*.ts`; миграции генерирует `drizzle-kit generate` в `drizzle/`, применяется при старте. Первая миграция — таблица `tokens`.
- `drizzle.config.ts` читает `DATABASE_URL` из env.

Альтернатива (Kysely/Prisma) отвергнута брифом: без тяжёлых ORM, Drizzle даёт типы и лёгкие миграции.

### D5. Auth: bearer-токены как в timelog

- Таблица `tokens`: `id` (uuid), `name`, `token_hash` (sha-256 hex секрета), `prefix` (первые символы для узнаваемости), `created_at`, `revoked_at`, `last_used_at`. Секрет — `crypto.randomBytes` в base64url; в БД только хэш, поэтому секрет восстанавливается только при создании.
- Секрет при `token create` печатается один раз; `token list` показывает имя, prefix, даты, статус; `token revoke <id|name>` ставит `revoked_at`.
- Bearer-middleware: парсит `Authorization: Bearer ...`, считает sha-256, ищет активный токен в БД (индекс по `token_hash`), при успехе кладёт контекст и обновляет `last_used_at` (без блокировки ответа). Отсутствие/невалидность — `401` с `WWW-Authenticate: Bearer`.
- Защищаются маршрут MCP и пример API-роута (слот `api`). `AUTH_DISABLED=true` — middleware пропускает запросы без токена (только для локальной разработки, значение фиксируется в env один раз).

### D6. MCP: Streamable HTTP в том же процессе

- `@modelcontextprotocol/sdk`, `StreamableHTTPServerTransport` в stateless-режиме (без sessionId): каждый HTTP-запрос — отдельный transport instance, что совместимо с Hono и не требует состояния между репликами.
- Монтирование: модуль `src/modules/mcp/` конвертирует `Request`/`Response` (нативный fetch API SDK ↔ Hono). Один POST/GET-эндпоинт `/mcp`, защищённый bearer-middleware.
- Регистратура: `src/modules/mcp/tools/registry.ts` — массив описаний инструментов `{ name, description, schema(zod), handler }`; регистратор кладёт их в `McpServer`. Добавление инструмента — один элемент массива, без знания о транспорте (задел под stdio).
- Один пример инструмента (`echo`-класса) для проверки клиентом.

### D7. Docker и compose

- Multi-stage `Dockerfile`: (1) `oven/bun` — `bun install --frozen-lockfile` и копия `node_modules`; (2) `oven/bun` — `tsup` бандл; (3) `node:24-alpine` — только бандлы `dist/`, `drizzle/`, `package.json`, non-root user, `CMD node dist/main.js`. Точка входа по умолчанию — сервер; CLI — override команды: `docker compose exec server node dist/token.js ...`.
- Healthcheck: `wget -qO- http://127.0.0.1:$PORT/health` (busybox wget есть в alpine), старт-период с запасом на миграции.
- `docker-compose.yml`: сервисы `db` (postgres) + `server` (build), тома, healthcheck-зависимость `depends_on: condition: service_healthy`.
- `compose.external-db.yml`: только `server`, `DATABASE_URL` из `.env`; использования: `docker compose -f compose.external-db.yml up`.

### D8. Качество и CI

- oxlint (`.oxlintrc.json`) + oxfmt (`.oxfmtrc.json`); `tsc --noEmit` для typecheck; Vitest для тестов.
- Скрипты: `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `format:check`, `test`, `token`, `db:generate`.
- CI (`.github/workflows/ci.yml`): setup Bun → install → typecheck → oxlint → oxfmt --check → `vitest run` → `docker build`. Юнит-тесты не требуют живой БД: репозиторий токенов тестируется через интерфейс с in-memory реализацией, интеграцию с Postgres проверяет сборка и ручной smoke из README.

### D9. Документация

README EN/RU переписываются под сервер-шаблон: быстрый старт (template → compose up), env-переменные, токены и CLI, отключение модулей (одна строка), паттерн вебхука для бота (маршрут в том же Hono, без кода в шаблоне), заметка про OAuth для публичных серверов, MCP-подключение. Структура обоих файлов зеркальна.

### D10. Починка CI: отсутствующие Docker-файлы

Диагноз сбоя шага `docker build -t small-server-template:ci .` в CI (`transferring dockerfile: 2B`, затем `failed to read dockerfile: open Dockerfile: no such file or directory`): в репозитории нет `Dockerfile` и `docker-compose.yml`. Задачи 6.2–6.3 помечены выполненными, но файлы не были закоммичены (в той среде пути считались закрытыми для исполнителя), а `.github/workflows/ci.yml` уже добавлен — BuildKit не находит Dockerfile в корне контекста и шаг падает.

Решение: создать оба файла по D7 — multi-stage `Dockerfile` (install на `oven/bun` → сборка `tsup` → рантайм `node:24-alpine` с `dist/`, `drizzle/`, `package.json`, non-root, `CMD node dist/main.js`) и `docker-compose.yml` (`db` + `server`, healthcheck, `depends_on: service_healthy`). Проверить, что `.dockerignore` не исключает входы сборки: `Dockerfile`, `package.json`, `bun.lock`, `tsconfig.json`, `tsup.config.ts`, `src/`, `drizzle/`. Шаг `docker build` в CI остаётся без изменений, без публикации. Пути `Dockerfile`, `docker-compose.yml` и `.github/` — обычные файлы репозитория, правятся исполнителем.

### D11. Починка CI: prepare-скрипт в Docker-этапе install

Диагноз повторного сбоя шага `docker build` (шаг `#13 [install 4/4] RUN bun install --frozen-lockfile`): `bun install` выполняет root-скрипт `prepare` из `package.json`, который делает `mkdir -p .git/hooks && cp .githooks/commit-msg …`. В Docker-этапе install по D7 копируются только `package.json` и `bun.lock`, а `.githooks` к тому же исключён из контекста сборки через `.dockerignore` (раздел «VCS и хуки») — `cp` падает с `cannot stat '.githooks/commit-msg': No such file or directory`, prepare выходит с кодом 1 и роняет всю сборку образа.

Решение: `prepare` становится no-op, когда каталог `.githooks` отсутствует (паттерн husky: git-хуки нужны только в рабочем чекауте разработчика). Референтная форма: `test ! -d .githooks || { mkdir -p .git/hooks && cp .githooks/commit-msg .git/hooks/commit-msg && chmod +x .git/hooks/commit-msg; }` — в рабочем чекауте поведение не меняется, а настоящий сбой копирования не маскируется (при наличии `.githooks` код выхода определяется самой установкой хука). `Dockerfile`, `.dockerignore` и `.github/workflows/ci.yml` не меняются. CI на GitHub Actions не затронут: после checkout `.githooks` присутствует и хук устанавливается как раньше.

Альтернативы отвергнуты: (1) копировать `.githooks` в этап install и убрать каталог из `.dockerignore` — образ получает файлы хостовской git-обвязки, которые внутри не нужны, ради удовлетворения пакетного скрипта; (2) `bun install --ignore-scripts` в Dockerfile — пропускает и lifecycle-скрипты зависимостей, то есть изменение шире, чем нужно для починки.

## Risks / Trade-offs

- [Совместимость MCP SDK с Hono-хендлером] → transport в stateless-режиме работает с нативным fetch `Request`/`Response`; при расхождении версий SDK — зафиксировать рабочую версию в диапазоне и покрыть smoke-тестом регистрацию инструментов.
- [Bun-специфика при установке (patching, нативные модули)] → прод-рантайм Node; от Bun зависит только install; lock-файл в репо и `--frozen-lockfile` в CI и Docker.
- [Миграции при старте у нескольких реплик — гонка] → принимаем для small-масштаба; `migrate()` у drizzle использует блокировку на уровне БД; в README зафиксировано «одна реплика».
- [oxlint/oxfmt — молодые инструменты] → фиксация минорных версий в `devDependencies`, обновление отдельным коммитом.
- [Секрет токена невосстановим после потери] → печать один раз — осознанный trade-off безопасности; `token create` в любой момент выдаёт новый.
- [`AUTH_DISABLED` может утечь в прод] → значение только из env при старте, в README предупреждение; по умолчанию выключен.

## Migration Plan

Новый код без существующих пользователей: изменения накатываются в ветке evolve через PR (модель изменений репозитория). Откат — revert коммита; миграций данных существующих инсталлов нет. Для пользователей шаблона путь обновления — сравнение с upstream-веткой (стандартная модель GitHub Template Repo).

Уточнение по ходу реализации: `Dockerfile` и `docker-compose.yml` из групп 6–7 в репозиторий не попали, из-за чего шаг `docker build` в CI падает; восстановление файлов вынесено в группу 9 (диагноз и решения — D10). Пути `Dockerfile`, `docker-compose.yml` и `.github/` — обычные файлы репозитория и правятся исполнителем; каждая группа оставляет репозиторий зелёным.

Второе уточнение: после восстановления Docker-файлов шаг `docker build` падает на prepare-скрипте `bun install` (D11); починка вынесена в группу 11 и не меняет Dockerfile и пайплайн.

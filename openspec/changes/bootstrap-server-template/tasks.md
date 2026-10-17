## 1. Инструментальный каркас <!-- tier: fast -->

- [x] 1.1 Обновить `package.json`: зависимости (hono, @hono/node-server, zod, pino; dev: typescript, tsx, tsup, oxlint, oxfmt, vitest, @types/node), скрипты `dev`, `build`, `start`, `typecheck`, `lint`, `format`, `format:check`, `test`; выполнить установку через Bun (lock-файл в репозиторий)
- [x] 1.2 Добавить `tsconfig.json` (strict, ESM, NodeNext), `tsup.config.ts` (entry `src/main.ts`, target node24), `vitest.config.ts`, `.oxlintrc.json`, `.oxfmtrc.json`, обновить `.gitignore` (dist, node_modules, .env)
- [x] 1.3 Создать `src/app.ts` (композиция: Hono-приложение + массив модулей) и `src/modules/health/routes.ts` с `GET /health`; создать `src/main.ts` (создание приложения, serve, PORT из окружения с значением по умолчанию)
- [x] 1.4 Написать тест: `GET /health` через `app.request()` отвечает 200
- [x] 1.5 Прогнать `format`, `build`, `lint`, `format:check`, `test` — всё зелёное

## 2. Env, логирование и слой БД <!-- tier: heavy -->

- [x] 2.1 Создать `src/env.ts`: zod-схема `PORT`, `DATABASE_URL`, `LOG_LEVEL`, `AUTH_DISABLED` с fail-fast разбором; тесты: невалидный/отсутствующий env завершает процесс с понятной ошибкой
- [x] 2.2 Создать `src/logger.ts` (pino, уровень из env) и middleware request-id: чтение/генерация `x-request-id`, запись в контекст, возврат заголовком; тест: запрос без заголовка получает сгенерированный `x-request-id`
- [x] 2.3 Создать `src/db/client.ts` (postgres.js пул + drizzle, параметры из `DATABASE_URL`, операция закрытия пула), каталог `src/db/schema/`, `drizzle.config.ts` и скрипт `db:generate`; инициализировать каталог `drizzle/` с пустым journal
- [x] 2.4 Собрать старт в `src/main.ts`: env → пул → `migrate()` (drizzle-orm/postgres-js/migrator) → serve; порт открывается только после миграций, ошибка на любом шаге — выход с кодом 1
- [x] 2.5 Тесты: порядок старта (serve не вызывается при ошибке миграции — мока), закрытие пула экспонировано
- [x] 2.6 Прогнать полный набор проверок группы

## 3. Готовность, graceful shutdown и OpenAPI <!-- tier: heavy -->

- [x] 3.1 Добавить `GET /ready`: `SELECT 1` через пул, 200 при живой БД, 503 при ошибке; тесты с подменой пула на живой/падающий
- [x] 3.2 Реализовать graceful shutdown по SIGTERM/SIGINT: `server.close()` → `pool.end()` → выход 0, с таймаутом принудительного выхода; тест: обработчики вызываются в правильном порядке, таймаут срабатывает
- [x] 3.3 Подключить OpenAPI: описание маршрутов (hono-openapi/describeRoute), выдача спецификации и Scalar UI на `/doc`; тест: в спецификации присутствуют `/health` и `/ready`
- [x] 3.4 Прогнать полный набор проверок группы

## 4. Аутентификация bearer-токенами <!-- tier: heavy -->

- [x] 4.1 Описать схему `src/db/schema/token.ts` (`id`, `name`, `token_hash`, `prefix`, `created_at`, `revoked_at`, `last_used_at`, индекс по `token_hash`) и сгенерировать миграцию `drizzle-kit generate`
- [x] 4.2 Создать репозиторий токенов (интерфейс + drizzle-реализация + in-memory реализация для тестов): list/create/revoke/find-active-by-hash/touch-last-used
- [x] 4.3 Создать сервис токенов: генерация секрета (crypto), sha-256 хэш, prefix, отзыв по id или имени; секрет возвращается только при создании
- [x] 4.4 Создать bearer-middleware: парсинг `Authorization`, поиск активного токена по хэшу, 401 + `WWW-Authenticate: Bearer` при отсутствии/невалидности/отзыве, обновление `last_used_at`; поддержка `AUTH_DISABLED=true`; тесты всех сценариев
- [x] 4.5 Создать CLI `src/cli/token.ts` (list/create/revoke), второй entry в tsup (`dist/token.js`), скрипт `token`; тесты команд на in-memory репозитории (секрет печатается один раз, list без секретов)
- [x] 4.6 Добавить API-слот: пример защищённого маршрута `/api` под bearer-middleware (`/health`, `/ready`, `/doc` без токена); тесты
- [x] 4.7 Прогнать полный набор проверок группы

## 5. MCP-модуль <!-- tier: heavy -->

- [ ] 5.1 Создать `src/modules/mcp/tools/registry.ts`: транспорт-агностичный реестр инструментов (имя, описание, zod-схема, обработчик) и регистратор в `McpServer`; тест: добавленный инструмент появляется в сервере
- [ ] 5.2 Добавить пример инструмента (echo-класса) в реестр; тест: вызов с корректными аргументами возвращает результат
- [ ] 5.3 Смонтировать MCP-эндпоинт `/mcp` через Streamable HTTP (stateless, `@modelcontextprotocol/sdk`) в модуле `src/modules/mcp/`, под защитой bearer-middleware; тесты: без токена 401, initialize по протоколу MCP проходит с токеном
- [ ] 5.4 Зарегистрировать MCP-модуль в `src/app.ts` одной строкой; тест: композиция без этой строки отвечает `/mcp` 404 и стартует без ошибок
- [ ] 5.5 Прогнать полный набор проверок группы

## 6. Docker и compose <!-- tier: heavy -->

Правки `Dockerfile` и `docker-compose.yml` в этой группе выполняются вручную владельцем (для исполнителя-агента эти пути закрыты), остальные файлы — обычными задачами.

- [ ] 6.1 Создать `.dockerignore` и `.env.example` со всеми переменными окружения и комментариями
- [ ] 6.2 Создать multi-stage `Dockerfile`: этап установки на `oven/bun` (`bun install --frozen-lockfile`), этап сборки бандла, рантайм `node:24-alpine` (только `dist/`, `drizzle/`, `package.json`), non-root пользователь, CMD — сервер
- [ ] 6.3 Создать `docker-compose.yml` (postgres + server, healthcheck по `/health`, `depends_on: service_healthy`) и `compose.external-db.yml` (только server, `DATABASE_URL` из env)
- [ ] 6.4 Проверить `docker compose config` для обоих вариантов и прогнать набор проверок группы

## 7. CI на GitHub Actions <!-- tier: fast -->

Правки в `.github/` выполняются вручную владельцем (путь закрыт для исполнителя-агента).

- [ ] 7.1 Создать `.github/workflows/ci.yml`: setup Bun → `bun install --frozen-lockfile` → `typecheck` → `lint` → `format:check` → `test` → `docker build` (без публикации); триггеры — pull request и push в `main`
- [ ] 7.2 Убедиться, что шаги CI соответствуют npm-скриптам, и прогнать эти скрипты локально

## 8. Документация <!-- tier: fast -->

- [ ] 8.1 Переписать `README.md` (EN): назначение шаблона, быстрый старт (Use this template → docker compose up → проверка /health, /ready, Scalar), переменные окружения, токены и CLI в контейнере, отключение модулей одной строкой, паттерн вебхука для бота, подключение MCP-клиента, заметка про OAuth для публичных серверов
- [ ] 8.2 Переписать `README.ru.md` (RU) зеркально EN, с переключателем языков в шапке обоих файлов
- [ ] 8.3 Обновить `openspec/config.yaml`: context под новый стек (TypeScript, Hono, Bun, Drizzle, oxlint/oxfmt, Vitest)
- [ ] 8.4 Прогнать набор проверок и `openspec validate --strict`

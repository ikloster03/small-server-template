[English](README.md) | **Русский**

# small-server-template

GitHub-шаблон небольшого API / MCP-сервера: нажмите **Use this template**, выполните `docker compose up` — и получите рабочий HTTP-сервис с health-пробами, OpenAPI-документацией, bearer-токенами, MCP-эндпоинтом и встроенной очередью фоновых задач.

Стек: TypeScript, Hono на Bun, SQLite (`bun:sqlite`) + Drizzle ORM, pino для логов, oxlint + oxfmt, Vitest.

## Что внутри

- HTTP-сервер на Hono (рантайм Bun): `GET /health` (liveness), `GET /ready` (readiness с проверкой `SELECT 1`), OpenAPI-спецификация на `/openapi.json`, Scalar UI на `/doc`.
- Встраиваемая SQLite через Drizzle ORM: режим WAL, миграции применяются при старте до открытия порта. Контейнер базы данных не нужен.
- Bearer-токены: хранятся в SQLite, секрет показывается один раз, CLI внутри контейнера.
- Фоновые задачи: таблица очереди в той же базе и воркер в том же процессе — отложенные задачи, повторы с backoff, dead-letter.
- MCP-модуль: Streamable HTTP транспорт на `/mcp` в том же процессе, с примером инструмента `echo`.
- Модульная композиция: каждый модуль подключается одной строкой в `src/app.ts` и так же отключается.
- Conventional Commits (commitlint + нативные хуки) и ручные релизы через changelogen.

## Быстрый старт

1. Нажмите **Use this template** и создайте свой репозиторий.
2. Скопируйте переменные окружения:

   ```sh
   cp .env.example .env
   ```

3. Запустите сервер (один контейнер — база встроенная):

   ```sh
   docker compose up -d --build
   ```

   Миграции применяются при старте; порт открывается только после их завершения. Файл SQLite живёт на томе `db-data`.

4. Проверьте, что всё живо:

   ```sh
   curl -sS http://localhost:3000/health   # {"status":"ok"}
   curl -sS http://localhost:3000/ready    # {"status":"ok"} — проверяет базу
   ```

5. Откройте документацию API: <http://localhost:3000/doc> (Scalar UI, спецификация на `/openapi.json`).
6. Создайте токен и вызовите защищённый API-слот:

   ```sh
   docker compose exec server bun dist/token.js create --name demo
   curl -sS http://localhost:3000/api -H "Authorization: Bearer <секрет из предыдущего шага>"
   ```

## Переменные окружения

| Переменная | По умолчанию | Описание |
| ---------- | ------------ | -------- |
| `PORT` | `3000` | Порт HTTP-сервера. |
| `DATABASE_PATH` | — | Путь к файлу SQLite. Обязательна; в контейнере compose задаёт `/data/app.db`. |
| `LOG_LEVEL` | `info` | Уровень pino: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. |
| `AUTH_DISABLED` | `false` | `true` отключает проверку токенов — только для локальной разработки. |

Невалидное окружение останавливает процесс при старте с понятной ошибкой (fail-fast).

Запускайте одну реплику: SQLite допускает один процесс-писатель, шаблон нацелен на «малый» масштаб (несколько пользователей, десятки задач в секунду). Очередь и база живут в одном файле — бэкап это копия файла.

## Токены и CLI

Токены — статические bearer-токены в SQLite: база хранит только SHA-256 хэш, CLI печатает секрет один раз при создании — восстановить его нельзя.

```sh
docker compose exec server bun dist/token.js list                 # таблица без секретов
docker compose exec server bun dist/token.js create --name bot    # печатает секрет один раз
docker compose exec server bun dist/token.js revoke bot           # отзыв по id или имени
```

Bearer-middleware защищает `/api` и `/mcp`; `/health`, `/ready` и `/doc` остаются открытыми. Запросы без токена, с невалидным или отозванным получают `401`. Потеряли секрет — создайте новый токен с тем же именем. Локально те же команды доступны через `bun run token -- list` (после `bun run build`).

## Фоновые задачи

Задачи живут в таблице `jobs` той же базы SQLite и переживают рестарты. Воркер работает в том же процессе, что и HTTP-сервер, опрашивая очередь раз в секунду.

```ts
// src/main.ts — обработчики собираются в createJobHandlers()
const jobsQueue = createJobsQueue(pool.db);
const jobsWorker = createJobsWorker(jobsQueue, createJobHandlers(logger));
jobsWorker.start();

// в любом месте кода:
await jobsQueue.enqueue({ kind: "log-example", payload: { hello: "world" } });
// отложенная задача:
await jobsQueue.enqueue({ kind: "log-example", payload: {}, runAt: new Date(Date.now() + 60_000) });
```

Задача с ошибкой повторяется с нарастающей задержкой; после `maxAttempts` (по умолчанию 3) получает статус `failed` — dead letter. Модуль очереди опционален: уберите эти строки из `src/main.ts`, и всё остальное продолжит работать.

## Отключение модулей

Модули собираются в одном месте — массив `modules` в `src/app.ts`:

```ts
export const modules: AppModule[] = [healthModule, apiModule, mcpModule];
```

Чтобы отключить модуль, уберите или закомментируйте его элемент:

```ts
export const modules: AppModule[] = [healthModule, apiModule]; // MCP выключен
```

Сервер стартует без маршрута `/mcp`, остальные эндпоинты работают как раньше.

## Подключение MCP-клиента

MCP-эндпоинт — `POST /mcp` (Streamable HTTP, stateless-режим) с заголовком `Authorization: Bearer <токен>`.

Проверка сырым запросом:

```sh
curl -sS http://localhost:3000/mcp \
  -H "Authorization: Bearer <токен>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

Или MCP Inspector / любой MCP-клиент: эндпоинт `http://localhost:3000/mcp`, заголовок `Authorization: Bearer <токен>`.

Инструменты добавляются в `src/modules/mcp/tools/registry.ts` — один элемент массива `mcpTools` (имя, описание, zod-схема, обработчик); пример `echo` показывает форму. Реестр не привязан к транспорту — инструменты переживут появление других транспортов (например, stdio).

## Паттерн webhook-бота

Кода бота в шаблоне нет, но сервер готов его принять: добавьте модуль с webhook-маршрутом в то же Hono-приложение.

1. Создайте `src/modules/bot/routes.ts` по образцу `src/modules/api/routes.ts`.
2. Зарегистрируйте маршрут, например `POST /webhook/telegram`, и обрабатывайте обновления.
3. Добавьте одну строку в массив `modules` в `src/app.ts`.
4. Защитите маршрут тем же bearer-middleware (или проверяйте секретный заголовок провайдера в обработчике):

```ts
app.use(`/webhook/*`, bearerAuth({ repository: deps.tokens, disabled: deps.authDisabled, logger: deps.logger }));
```

Токен бота держите в env (`src/env.ts`), укажите провайдеру `https://<ваш-хост>/webhook/<провайдер>` — request-id в логах, health-пробы и graceful shutdown достанутся бесплатно.

## Заметка про OAuth

Статического bearer-токена достаточно для приватного сервиса с несколькими клиентами. Если сервер публичный — особенно MCP-сервер для сторонних пользователей — переходите на OAuth 2.1 (authorization flow из спецификации MCP) вместо общих статических токенов.

## Разработка

```sh
bun install         # зависимости (Bun — рантайм и пакетный менеджер)
bun run dev         # bun --watch, Bun сам подхватывает .env
bun run test        # Vitest (запуск на Node, bun:sqlite шимуется через node:sqlite)
bun run lint        # oxlint
bun run format      # oxfmt
bun run build       # бандл tsup в dist/
bun run db:generate # новая миграция Drizzle из изменений схемы
```

Коммиты следуют Conventional Commits (`type: subject`, без `Co-authored-by`). Релизы вручную: Actions → **Release**.

## Лицензия

[MIT](LICENSE)

[English](README.md) | **Русский**

# small-server-template

GitHub-шаблон небольшого API/MCP-сервера: нажмите **Use this template**, запустите `docker compose up` — и получите работающий HTTP-сервис с пробами здоровья, OpenAPI-документацией, bearer-аутентификацией и MCP-эндпоинтом.

Стек: TypeScript, Hono (Node.js), PostgreSQL + Drizzle ORM, Bun как пакетный менеджер, логирование pino, oxlint + oxfmt, Vitest.

## Что внутри

- HTTP-сервер на Hono: `GET /health` (liveness), `GET /ready` (readiness с проверкой `SELECT 1`), OpenAPI-спека на `/openapi.json`, Scalar UI на `/doc`.
- PostgreSQL через Drizzle ORM: миграции применяются при старте, до открытия порта.
- Bearer-аутентификация: токены живут в Postgres, секрет показывается один раз, CLI внутри контейнера.
- MCP-модуль: транспорт Streamable HTTP на `/mcp` в том же процессе, пример инструмента `echo`.
- Модульная композиция: каждый модуль подключается одной строкой в `src/app.ts` и так же отключается.
- Conventional Commits (commitlint + нативные хуки) и ручные релизы через changelogen.

## Быстрый старт

1. Нажмите **Use this template** и создайте свой репозиторий.
2. Скопируйте значения окружения по умолчанию и смените пароль базы:

   ```sh
   cp .env.example .env
   ```

3. Поднимите Postgres и сервер:

   ```sh
   docker compose up -d --build
   ```

   Миграции применяются при старте; порт открывается только после них.

4. Проверьте, что всё живое:

   ```sh
   curl -sS http://localhost:3000/health   # {"status":"ok"}
   curl -sS http://localhost:3000/ready    # {"status":"ok"} — проверяет базу
   ```

5. Откройте документацию API: <http://localhost:3000/doc> (Scalar UI, спека на `/openapi.json`).
6. Создайте токен и вызовите защищённый API-слот:

   ```sh
   docker compose exec server node dist/token.js create --name demo
   curl -sS http://localhost:3000/api -H "Authorization: Bearer <секрет из шага выше>"
   ```

## Переменные окружения

| Переменная | По умолчанию | Описание |
| ---------- | ------------ | -------- |
| `PORT` | `3000` | Порт HTTP-сервера. |
| `DATABASE_URL` | — | URL PostgreSQL (`postgres://` или `postgresql://`). Обязательна. |
| `LOG_LEVEL` | `info` | Уровень pino: `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. |
| `AUTH_DISABLED` | `false` | `true` отключает проверку bearer-токенов — только для локальной разработки. |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | `app` / — / `app` | Данные локальной Postgres из `docker-compose.yml`; compose собирает из них `DATABASE_URL`. |

Невалидный env останавливает процесс на старте с понятной ошибкой (fail-fast). Для внешней базы используйте `docker compose -f compose.external-db.yml up` с `DATABASE_URL` из `.env`.

Запускайте одну реплику: миграции применяются при старте, шаблон рассчитан на масштаб «small».

## Токены и CLI

Токены — статические bearer-токены в Postgres: в базе только SHA-256-хэш, а секрет CLI печатает один раз при создании — потом его не восстановить.

```sh
docker compose exec server node dist/token.js list                 # таблица без секретов
docker compose exec server node dist/token.js create --name bot    # печатает секрет один раз
docker compose exec server node dist/token.js revoke bot           # отзыв по id или имени
```

Bearer-middleware защищает `/api` и `/mcp`; `/health`, `/ready` и `/doc` остаются открытыми. Запросы без токена, с невалидным или отозванным получают `401`. Потеряли секрет — создайте новый токен с тем же именем. Локально те же команды доступны через `npm run token -- list` (после `npm run build`).

## Отключение модулей

Модули собираются в одном месте — массиве `modules` в `src/app.ts`:

```ts
export const modules: AppModule[] = [healthModule, apiModule, mcpModule];
```

Чтобы отключить модуль, уберите или закомментируйте его элемент:

```ts
export const modules: AppModule[] = [healthModule, apiModule]; // MCP выключен
```

Сервер стартует без маршрута `/mcp`, остальные эндпоинты работают как раньше.

## Подключение MCP-клиента

MCP-эндпоинт — `POST /mcp` (Streamable HTTP, stateless-режим) с заголовком `Authorization: Bearer <секрет>`.

Проверка сырым запросом:

```sh
curl -sS http://localhost:3000/mcp \
  -H "Authorization: Bearer <секрет>" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1.0.0"}}}'
```

Или MCP Inspector / любой MCP-клиент: эндпоинт `http://localhost:3000/mcp`, заголовок `Authorization: Bearer <секрет>`.

Инструменты добавляются в `src/modules/mcp/tools/registry.ts` — один элемент массива `mcpTools` (имя, описание, zod-схема, обработчик); пример `echo` показывает форму. Регистратура транспорт-агностична, инструменты переживут будущие транспорты (например, stdio).

## Паттерн вебхука для бота

Кода бота в шаблоне нет, но сервер готов его принять: добавьте модуль с вебхук-маршрутом в то же Hono-приложение.

1. Создайте `src/modules/bot/routes.ts` по образцу `src/modules/api/routes.ts`.
2. Зарегистрируйте маршрут, например `POST /webhook/telegram`, и обработайте апдейт.
3. Добавьте одну строку в массив `modules` в `src/app.ts`.
4. Защитите маршрут тем же bearer-middleware (или проверяйте секретный заголовок провайдера внутри обработчика):

```ts
app.use(`/webhook/*`, bearerAuth({ repository: deps.tokens, disabled: deps.authDisabled, logger: deps.logger }));
```

Токен бота держите в env (`src/env.ts`), провайдера направьте на `https://<ваш-хост>/webhook/<провайдер>` — и логи с request-id, пробы здоровья и graceful shutdown достаются бесплатно.

## Заметка про OAuth

Статического bearer-токена достаточно частному сервису с горсткой клиентов. Если выставляете сервер наружу — особенно MCP-сервер для сторонних пользователей — замените общие статические токены на OAuth 2.1 (authorization flow из спецификации MCP).

## Разработка

```sh
bun install         # зависимости (Bun — пакетный менеджер)
npm run dev         # tsx watch, нужна доступная DATABASE_URL
npm run test        # Vitest
npm run lint        # oxlint
npm run format      # oxfmt
npm run build       # бандл tsup в dist/
npm run db:generate # новая миграция Drizzle по изменениям схемы
```

Коммиты в формате Conventional Commits (`type: subject`, без `Co-authored-by`). Релизы вручную: Actions → **Release**.

## Лицензия

[MIT](LICENSE)

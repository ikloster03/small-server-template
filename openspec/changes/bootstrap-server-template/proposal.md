## Why

Репозиторий сейчас — чистая копия `project-template` (обвязка: commitlint, хуки, changelogen, OpenSpec) без серверного кода. Нужен самодостаточный GitHub Template Repo, из которого за минуты поднимается небольшой сервис (API и/или MCP-сервер): `Use this template` → `docker compose up` → рабочий сервер. Эталон auth и топологии — `ikloster03/timelog`.

## What Changes

- Добавляется серверное ядро на TypeScript + Hono (Node.js): типизированный env через zod с fail-fast валидацией, pino-логирование с request-id, эндпоинты `/health` и `/ready`, graceful shutdown по SIGTERM (сервер + пул соединений), OpenAPI-спецификация из роутов + Scalar UI.
- Добавляется слой БД: PostgreSQL + Drizzle ORM + postgres.js; миграции применяются при старте, порт не открывается до их завершения.
- Добавляется модуль MCP: транспорт Streamable HTTP поверх того же Hono-процесса, транспорт-агностичная регистратура инструментов, один пример инструмента; отключение модуля — правка одной строки в композиционном файле, сервер стартует без него.
- Добавляется аутентификация как в timelog: статические bearer-токены в Postgres (хэш в БД, секрет показывается один раз при создании), CLI внутри контейнера `token list / create / revoke`, bearer-middleware на защищённых маршрутах (MCP, API-слот).
- Добавляется инфраструктура: Docker multi-stage (установка на Bun-образе, рантайм node-alpine с бандлом tsup), docker compose в двух вариантах — локальная Postgres и внешняя БД.
- Добавляется инструментальная обвязка кода: Bun как пакетный менеджер, oxlint + oxfmt, Vitest, tsx (dev) + tsup (prod), npm-скрипты.
- Добавляется CI на GitHub Actions: typecheck + линт + тесты + сборка Docker-образа.
- Чинится красный шаг `docker build` в CI: `Dockerfile` и `docker-compose.yml` из задач 6.2–6.3 не попали в репозиторий, поэтому сборка образа падает с `open Dockerfile: no such file or directory`; файлы восстанавливаются по решениям design, состав пайплайна не меняется.
- README (EN/RU) переписывается под шаблон сервера: запуск, auth, отключение модулей, паттерн вебхука для бота (бот в код не входит), заметка про OAuth для публичных серверов.

Не меняется: модель релизов через changelogen, commitlint + `.githooks`, OpenSpec-обвязка.

## Capabilities

### New Capabilities

- `server-core`: запуск HTTP-сервера на Hono: env-валидация, логирование с request-id, `/health` и `/ready`, graceful shutdown, OpenAPI + Scalar UI.
- `database`: подключение к PostgreSQL через Drizzle + postgres.js, пул соединений, миграции при старте до открытия порта.
- `token-auth`: статические bearer-токены в Postgres, middleware защиты маршрутов, CLI управления токенами внутри контейнера.
- `mcp-server`: MCP-модуль на Streamable HTTP в том же процессе, регистратура инструментов с транспорт-агностичным API, пример инструмента, отключение одной строкой.
- `container`: multi-stage Dockerfile (Bun-этап сборки, node-alpine рантайм), docker compose с локальной и внешней БД, healthcheck.
- `ci`: GitHub Actions — typecheck, линт, тесты, сборка Docker-образа.
- `docs`: README EN/RU — быстрый старт, auth, отключение модулей, паттерн вебхука, заметка про OAuth.

### Modified Capabilities

<!-- Нет: в openspec/specs/ пока нет ни одной спеки, меняются только README и обвязка вне спек. -->

## Impact

- Код: новые каталоги `src/` (ядро, модули, CLI), `drizzle/` (миграции), `Dockerfile`, `docker-compose*.yml`, `.github/workflows/ci.yml`.
- `package.json`: переход на Bun-скрипты, новые зависимости (hono, drizzle-orm, postgres, zod, pino, @hono/scalar, @modelcontextprotocol/sdk, drizzle-kit, tsx, tsup, oxlint, oxfmt, vitest).
- Существующая обвязка (`release.yml`, `.githooks`, commitlint, OpenSpec) сохраняется как есть.
- README EN/RU заменяются на документацию шаблона сервера.

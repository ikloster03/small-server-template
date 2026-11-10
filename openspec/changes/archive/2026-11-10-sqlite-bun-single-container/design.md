# Design: sqlite-bun-single-container

## Context

Обсуждение стартовало с вопроса «можно ли SQLite вместо Postgres для маленького бэкенда на 5 пользователей» и прошло через выбор рантайма к итоговой связке: **Bun + SQLite + Docker (один контейнер)**. Ключевой факт архитектуры: бизнес-логика уже изолирована за интерфейсом `TokenRepository`, Postgres торчит наружу только в 5 точках (`db/client.ts`, `db/schema/token.ts`, `env.ts`, `main.ts`, `drizzle.config.ts` + compose) — смена БД не затрагивает модули HTTP/MCP/auth.

## Decisions

### D1. Рантайм: Bun вместо Node.js

- HTTP: `Bun.serve({ fetch: app.fetch, port })` вместо `@hono/node-server`; Hono остаётся без изменений.
- Bun уже используется как пакетный менеджер (`bun.lock`) — расширяем роль до рантайма, Node-зависимости `@hono/node-server` и `postgres` уходят.
- Мотивация: мгновенный старт, встроенный `bun:sqlite` (без нативных сборок `better-sqlite3` под архитектуру), образ `oven/bun:1-alpine` меньше node-образа.
- Альтернативы отклонены: Go/Rust — рерайт ради масштаба, которого нет; Deno — экосистема привычнее под Node/Bun.

### D2. БД: SQLite через `bun:sqlite` + `drizzle-orm/bun-sqlite`

- `DATABASE_PATH` (default `/data/app.db`), каталог создаётся при старте, fail-fast если путь не открывается.
- Прагмы при инициализации: `journal_mode = WAL` (чтения не блокируются писателем), `busy_timeout = 5000`, `foreign_keys = ON`.
- `ready()` остаётся `select 1` — контракт `/ready` не меняется.
- Закрытие: `db.close()` в graceful shutdown после остановки HTTP — как раньше закрывался пул.
- Ограничение единственного писателя принято осознанно: для ≤5 пользователей его нет; конкурентный grab задачи из очереди транзакцией становится тривиально безопасным.

### D3. Схема и миграции

- `drizzle.config.ts`: `dialect: "sqlite"`, те же `schema/` и `out: drizzle/`; мигратор `drizzle-orm/bun-sqlite/migrator`, применяется при старте ДО открытия порта (контракт сохранён).
- `uuid().defaultRandom()` → `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` — у SQLite нет серверного генератора UUID.
- `timestamp({ withTimezone: true })` → `integer({ mode: "timestamp" })` — Drizzle конвертирует Date ↔ epoch автоматически; `touchLastUsed(new Date())` остаётся без изменений.
- `sql`coalesce(..., now())`` в revoke → `new Date()` из кода: `now()` — функция Postgres.

### D4. Контейнер: один сервис

- Multi-stage Dockerfile: install/build на `oven/bun:1`, рантайм `oven/bun:1-alpine` с бандлом и `drizzle/`; non-root пользователь сохраняется.
- `docker-compose.yml`: только `server`, том `db-data:/data`, `DATABASE_PATH: /data/app.db`; healthcheck `/health` остаётся. Ожидание готовности БД (`depends_on: service_healthy`) больше не нужно.
- `compose.external-db.yml` удаляется — внешней БД больше нет; путь «вырасти» = отдельное изменение с переездом на Postgres (код за интерфейсами, смена драйвера Drizzle).
- Известная ловушка (из bootstrap-изменения): зелёная сборка ≠ работающий образ — обязателен smoke-run контейнера с dummy-env (ожидаем fail-fast на БД, но не ERR_MODULE_NOT_FOUND).

### D5. Очередь: capability `background-jobs`, таблица в той же БД

- Таблица `jobs`: `id` (uuid из кода), `kind`, `payload` (JSON text), `status` (`pending|running|done|failed`), `run_at` (epoch ms), `attempts`, `created_at`.
- Воркер в том же процессе Bun: поллинг раз в 1 с; захват задачи — в транзакции (`select ... limit 1` + `update status='running'`), единый писатель SQLite делает grab безопасным без `FOR UPDATE`.
- Повторы: `attempts` + backoff (пересчёт `run_at`), после N попыток — `failed` (dead letter).
- Модуль подключается одной строкой в `src/app.ts` и отключается так же — как остальные модули шаблона.
- Границы применимости зафиксированы: десятки задач/сек и один инстанс; pub/sub между сервисами и тысячи задач/сек = выход за рамки шаблона.

### D6. Отложено / вне рамок

- `bun build --compile` в автономный бинарник — Docker остаётся способом деплоя (решение Ивана: «только оставить docker»).
- Ретеншн выполненных задач (чистка старых `done`) — можно добавить как настройку воркера, не блокирует.
- Variант шаблона с Postgres параллельно SQLite-варианту — отклонено: шаблон один, двойное сопровождение дороже.

## Risks / Trade-offs

- Один процесс-писатель: при 5 пользователях и очереди не проявляется; зафиксировано как принятое ограничение в proposal.
- Поллинг очереди: латентность до ~1 с — приемлемо для фоновых задач масштаба шаблона.
- bun:sqlite синхронный: на диске быстрые операции, WAL-чтения конкурентны; для профиля нагрузки шаблона достаточно.

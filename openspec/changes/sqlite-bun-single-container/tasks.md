# Tasks

## 1. Слой БД на SQLite

- [ ] 1.1 Убрать зависимости `postgres` и `@hono/node-server` из `package.json`, проверить, что `bun install` проходит и `bun.lock` обновлён
- [ ] 1.2 Переписать `src/db/client.ts` на `bun:sqlite` + `drizzle-orm/bun-sqlite`: прагмы WAL / busy_timeout / foreign_keys при открытии, `ready()` через `select 1`, `close()` для graceful shutdown; обновить `src/db/client.test.ts` и убедиться, что тесты проходят
- [ ] 1.3 Перевести `src/db/schema/token.ts` на `sqliteTable` (uuid из кода через `$defaultFn(crypto.randomUUID())`, таймстемпы `integer({ mode: "timestamp" })`), переключить `drizzle.config.ts` на dialect `sqlite`, сгенерировать новую миграцию в `drizzle/` и убедиться, что `bun run db:generate` её создаёт
- [ ] 1.4 Заменить мигратор в `src/main.ts` на `drizzle-orm/bun-sqlite/migrator`, проверить стартовым тестом: миграции применяются до открытия порта, при ошибке миграции процесс выходит с ненулевым кодом

## 2. Рантайм Bun и окружение

- [ ] 2.1 Запустить HTTP-сервер через `Bun.serve` в `src/main.ts` (порт открывается после env + БД + миграций), адаптировать graceful shutdown и проверить тестом порядок инициализации
- [ ] 2.2 Заменить в `src/env.ts` `DATABASE_URL` на `DATABASE_PATH` (путь к файлу, default `/data/app.db`), обновить `src/env.test.ts`: отсутствие переменной/невалидный `PORT` дают fail-fast до открытия порта

## 3. Контейнер

- [ ] 3.1 Перестроить `Dockerfile` на `oven/bun` (multi-stage, alpine-рантайм, non-root, бандл + миграции); проверить smoke-запуском собранного образа с dummy `DATABASE_PATH` на не-записываемый путь — ожидаем fail-fast приложения, но не `ERR_MODULE_NOT_FOUND`
- [ ] 3.2 Сократить `docker-compose.yml` до одного сервиса с томом под `/data`, удалить `compose.external-db.yml` и `POSTGRES_*` из `.env.example`; проверить `docker compose -f docker-compose.yml config` без ошибок

## 4. Токены на SQLite

- [ ] 4.1 Адаптировать `src/auth/drizzle-token-repository.ts` (убрать SQL `now()` — передавать `new Date()` из кода), прогнать интеграционный тест репозитория на SQLite (temp-файл или `:memory:`)
- [ ] 4.2 Проверить CLI `token.js` под Bun: `list`, `create --name demo` (секрет печатается один раз), `revoke demo` — вручную на локальном запуске, зафиксировать вывод

## 5. Модуль очереди background-jobs

- [ ] 5.1 Добавить схему `jobs` (`id`, `kind`, `payload` JSON text, `status`, `run_at`, `attempts`, `created_at`) в `src/db/schema/` и сгенерировать миграцию
- [ ] 5.2 Реализовать модуль `src/modules/jobs/`: постановка задач, воркер-поллинг с атомарным захватом в транзакции, переходы статусов, повторы с backoff и лимитом попыток в `failed`; покрыть юнит-тестами с фиктивными таймерами (в т.ч. сценарии «ошибка обработчика» и «исчерпание попыток»)
- [ ] 5.3 Подключить модуль очереди одной строкой в `src/app.ts` и проверить тестом, что без этой строки HTTP/auth/MCP работают без изменений (модульность)

## 6. Интеграция и документация

- [ ] 6.1 Обновить `README.md` и `README.ru.md`: quick start без Postgres, таблица env (`DATABASE_PATH`), раздел про очередь задач; убедиться, что описанные команды выполняются как написано
- [ ] 6.2 Локальная интеграция: `docker compose up` поднимает один сервис, `/health` и `/ready` дают `200`, пересоздание контейнера без удаления тома сохраняет токены и задачи
- [ ] 6.3 Финальные проверки: `bun run typecheck`, `bun run lint`, `bun test` — все зелёные; `openspec validate sqlite-bun-single-container` без ошибок

## Workflow follow-up

- Заархивировать `bootstrap-server-template` ДО этого изменения: main-спеки `database`, `container`, `server-core`, `token-auth` ещё пусты, и archive текущего change с MODIFIED/RENAMED дельтами откажется работать, пока bootstrap не синхронизирует спеки
- После apply: PR `evolve/sqlite-bun-single-container` → `main`, ревью, merge; затем archive этого изменения

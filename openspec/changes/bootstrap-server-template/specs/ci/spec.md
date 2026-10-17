## ADDED Requirements

### Requirement: Пайплайн проверок

CI ДОЛЖЕН (MUST) на каждый pull request и push в `main` выполнять: typecheck (`tsc --noEmit`), линт (oxlint), проверку формата (oxfmt), тесты (Vitest). Все шаги ДОЛЖНЫ (MUST) использовать Bun для установки зависимостей с замороженным lock-файлом.

#### Scenario: Pull request

- **WHEN** открывается pull request
- **THEN** CI запускает typecheck, линт, проверку формата и тесты

#### Scenario: Красная проверка

- **WHEN** любой из шагов падает
- **THEN** итоговый статус проверки в pull request красный

### Requirement: Сборка Docker-образа в CI

CI ДОЛЖЕН (MUST) собирать Docker-образ как шаг проверки (без публикации), чтобы регрессии Dockerfile ловились до merge.

#### Scenario: Сломанный Dockerfile

- **WHEN** Dockerfile перестаёт собираться
- **THEN** соответствующий шаг CI падает

#### Scenario: Dockerfile присутствует в корне репозитория

- **WHEN** пайплайн выполняется на ветке, где `Dockerfile` лежит в корне репозитория рядом с входами сборки
- **THEN** шаг Docker build завершается успешно

#### Scenario: Контекст сборки без git-хуков

- **WHEN** этап установки внутри Docker-образа выполняется без каталога `.githooks` (скопированы только манифесты пакетов)
- **THEN** `bun install --frozen-lockfile` завершается успешно и шаг Docker build остаётся зелёным

### Requirement: Локальная эквивалентность

CI-шаги ДОЛЖНЫ (MUST) соответствовать npm-скриптам проекта (`typecheck`, `lint`, `format:check`, `test`), чтобы разработчик мог воспроизвести пайплайн локально теми же командами.

#### Scenario: Локальный прогон

- **WHEN** разработчик выполняет те же скрипты локально
- **THEN** результаты совпадают с CI

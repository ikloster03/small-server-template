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

### Requirement: Локальная эквивалентность

CI-шаги ДОЛЖНЫ (MUST) соответствовать npm-скриптам проекта (`typecheck`, `lint`, `format:check`, `test`), чтобы разработчик мог воспроизвести пайплайн локально теми же командами.

#### Scenario: Локальный прогон

- **WHEN** разработчик выполняет те же скрипты локально
- **THEN** результаты совпадают с CI

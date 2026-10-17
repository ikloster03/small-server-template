## ADDED Requirements

### Requirement: Multi-stage Dockerfile

Образ ДОЛЖЕН (MUST) собираться в несколько этапов: установка зависимостей и сборка на образе Bun, рантайм — `node`-образ на alpine, содержащий только прод-бандл, файлы миграций и минимальный набор файлов. Контейнер ДОЛЖЕН (MUST) работать от non-root пользователя и запускать сервер как entrypoint по умолчанию.

#### Scenario: Сборка образа

- **WHEN** выполняется `docker build`
- **THEN** образ собирается успешно и содержит бандл и миграции

#### Scenario: Запуск контейнера

- **WHEN** контейнер запускается с валидным `DATABASE_URL`
- **THEN** сервер стартует от non-root пользователя без дополнительных аргументов

### Requirement: Наличие и валидность файлов контейнера

`Dockerfile` ДОЛЖЕН (MUST) существовать в корне репозитория, чтобы `docker build .` находил его без флага `-f`. Оба compose-файла (`docker-compose.yml`, `compose.external-db.yml`) ДОЛЖНЫ (MUST) существовать и проходить `docker compose -f <файл> config` без ошибок.

#### Scenario: Сборка без явного пути к Dockerfile

- **WHEN** выполняется `docker build .` из корня репозитория
- **THEN** Dockerfile находится и используется по умолчанию

#### Scenario: Проверка compose-конфигурации

- **WHEN** выполняется `docker compose -f docker-compose.yml config` и `docker compose -f compose.external-db.yml config`
- **THEN** обе команды завершаются без ошибок

### Requirement: Compose с локальной Postgres

`docker-compose.yml` ДОЛЖЕН (MUST) определять сервис локальной Postgres и сервис сервера; сервер ДОЛЖЕН (MUST) стартовать после готовности БД (`depends_on` с условием healthcheck). `docker compose up` ДОЛЖЕН (MUST) поднимать рабочую связку: БД, миграции, сервер.

#### Scenario: Локальный старт

- **WHEN** выполняется `docker compose up` на свежескопированном шаблоне
- **THEN** поднимаются БД и сервер, миграции применяются, `/health` и `/ready` отвечают `200`

### Requirement: Compose для внешней БД

Проект ДОЛЖЕН (MUST) предоставлять второй compose-файл, запускающий только сервер с `DATABASE_URL` из окружения, без сервиса локальной БД.

#### Scenario: Внешняя БД

- **WHEN** выполняется запуск с этим compose-файлом и `DATABASE_URL` указывает на внешнюю БД
- **THEN** поднимается только сервис сервера, подключение и миграции идут к внешней БД

### Requirement: Healthcheck контейнера

В определении сервиса сервера ДОЛЖЕН (MUST) быть настроен Docker healthcheck по эндпоинту `/health`, с периодом старта, учитывающим применение миграций.

#### Scenario: Healthcheck проходит

- **WHEN** контейнер сервера перешёл в running и миграции завершены
- **THEN** healthcheck по `/health` переводит контейнер в healthy

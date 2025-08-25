# WB Box Tariffs: WB → PostgreSQL → Google Sheets

Сервис на Node.js/TypeScript, который:
- раз в час получает тарифы WB по коробам и сохраняет их в PostgreSQL (срез на текущий день + плоские строки);
- регулярно публикует коэффициенты хранения в Google Sheets (лист stocks_coefs), отсортированные по возрастанию.

Работает в Docker. Миграции применяются автоматически.

## Быстрый старт

Требования:
- Docker/Docker Compose

Шаги:
1) Клонируйте репозиторий и перейдите в папку проекта.
2) Создайте .env из шаблона:
   - cp .env.example .env
3) Укажите токен WB в .env:
   - WB_API_TOKEN=<ваш токен>  (можно без Bearer — добавится автоматически)
4) Для Google Sheets настройте сервисный аккаунт и доступ, укажите IDs таблиц:
   - GOOGLE_SHEETS_IDS=список ID таблиц через запятую (например: 1Abc...,1Xyz...)
   - Креды сервисного аккаунта (один из вариантов):
   -GOOGLE_APPLICATION_CREDENTIALS=/путь/к/google-service-account.json
5) Запустите:
   - docker compose up --build

Проверка:
- Логи приложения: docker logs -f <имя контейнера app>
- В БД появятся таблицы:
  - wb_box_tariffs_daily_snapshots (сырой ответ)
  - wb_box_tariffs_daily_items (плоские строки)
- Выборка из БД (через psql): см. раздел Проверка.

Важно: по условиям теста DB доступы фиксированы — postgres/postgres/postgres (уже выставлено в compose).

## Что делает сервис

Пайплайн:
- Каждый час (WB_FETCH_INTERVAL_MS) делает GET к https://common-api.wildberries.ru/api/v1/tariffs/box с обязательным параметром date=YYYY-MM-DD.
- Заголовок авторизации: Authorization: Bearer <token> (префикс Bearer добавим сами, если вы укажете “голый” токен).
- Ответ WB парсится в нормализованный вид:
  - Используем response.data.warehouseList.
  - Забираем три коэффициента (при наличии):
    - boxStorageCoefExpr → delivery_type=storage
    - boxDeliveryCoefExpr → delivery_type=delivery
    - boxDeliveryMarketplaceCoefExpr → delivery_type=delivery_marketplace
  - Строковые числа с запятой и символом «-» приводим к числам; CoefExpr интерпретируем в сотых долях: 195 → 1.95.
- Сохраняем:
  - wb_box_tariffs_daily_snapshots: сырой JSON на день.
  - wb_box_tariffs_daily_items: нормализованные строки (day + fingerprint, уникальность по (day, fingerprint)).
- При каждом запуске в течение дня делаем UPSERT в текущий день (обновление данных дня).
- Google Sheets:
  - Для списка spreadsheetId (GOOGLE_SHEETS_IDS) создаём/очищаем лист stocks_coefs и выгружаем только строки delivery_type=storage, отсортированные по coef ASC.

Защита от гонок:
- Используем pg_try_advisory_lock — если случайно запустится второй воркер, он не нарушит данные.

## Архитектура

- Node.js 20 + TypeScript
- PostgreSQL 16 + Knex
- Google Sheets API (service account)
- Логи: log4js
- Планировщик: setInterval в процессе app

Потоки данных:
WB API → парсер → PostgreSQL (JSONB snapshot + normalized rows) → Sheets push (stocks_coefs)

## Конфигурация (.env)

- TZ: часовой пояс контейнера (по умолчанию UTC)
- LOG_LEVEL: уровень логирования (info|debug|warn|error)

База данных:
- DB_HOST=db
- DB_PORT=5432
- DB_USER=postgres
- DB_PASSWORD=postgres
- DB_NAME=postgres

WB API:
- WB_TARIFFS_BOX_ENDPOINT=https://common-api.wildberries.ru/api/v1/tariffs/box
- WB_TARIFFS_BOX_DATE=YYYY-MM-DD (необязательно; по умолчанию — сегодня UTC)
- WB_TARIFFS_BOX_QUERY=строка query-параметров (необязательно; {today} заменится на YYYY-MM-DD)
- WB_API_TOKEN=<токен> (можно без Bearer — добавим автоматически)
- WB_AUTH_HEADER_NAME=Authorization
- WB_FETCH_INTERVAL_MS=3600000 (1 час)
- WB_REQUEST_TIMEOUT_MS=15000

Google Sheets:
- GOOGLE_SHEETS_IDS=список ID таблиц через запятую (например: 1Abc...,1Xyz...)
- Креды сервисного аккаунта (один из вариантов):
  - GOOGLE_APPLICATION_CREDENTIALS=/путь/к/google-service-account.json

Служебное:
- JOB_ADVISORY_LOCK_KEY=834234234 (число для advisory lock)

Пример .env (минимум для WB):
TZ=UTC
NODE_ENV=production
LOG_LEVEL=info

DB_HOST=db
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=postgres

WB_TARIFFS_BOX_ENDPOINT=https://common-api.wildberries.ru/api/v1/tariffs/box
WB_API_TOKEN=ваш_токен_от_WB   # можно без "Bearer", добавится автоматически
WB_TARIFFS_BOX_DATE=2025-09-01 # опционально; если не указано — сегодня
WB_AUTH_HEADER_NAME=Authorization
WB_FETCH_INTERVAL_MS=3600000
WB_REQUEST_TIMEOUT_MS=15000

GOOGLE_SHEETS_IDS=
GOOGLE_APPLICATION_CREDENTIALS=

JOB_ADVISORY_LOCK_KEY=834234234

## Схема БД

- wb_box_tariffs_daily_snapshots
  - day date PK
  - data jsonb (сырой ответ WB)
  - first_fetched_at timestamptz
  - last_fetched_at timestamptz
  - items_count int
  - source_hash text
  - created_at, updated_at timestamptz

- wb_box_tariffs_daily_items
  - id bigserial PK
  - day date
  - fingerprint text (уникален в рамках day)
  - warehouse_name text
  - box_type text
  - delivery_type text — "storage" | "delivery" | "delivery_marketplace"
  - region text — гео/регион (например, “Центральный федеральный округ”)
  - coef numeric(12,6)
  - meta jsonb — исходный элемент WB
  - created_at, updated_at timestamptz
  - unique(day, fingerprint), индексы: (day, coef), (fingerprint)

Fingerprint считается по стабильному набору полей: warehouse_name + box_type + delivery_type + region.

## Обновление Google Sheets

- Требуется сервисный аккаунт Google (JSON‑ключ).
- Указать в .env:
  - GOOGLE_SHEETS_ENABLED=true
  - GOOGLE_SHEETS_IDS=1Abc...,1Xyz...
  - GOOGLE_APPLICATION_CREDENTIALS=/secrets/google-service-account.json
- Формат листа stocks_coefs:
  - Колонки: day, warehouse_name, box_type, delivery_type, region, coef
  - Строки: только delivery_type=storage, сортировка по coef ASC
- Сервис создаёт лист при отсутствии и перезаписывает его при каждом цикле.

## Запуск/остановка

- Первый запуск:
  - docker compose up --build
- Фоновый режим:
  - docker compose up -d
- Логи:
  - docker logs -f <имя контейнера app>
- Остановка:
  - docker compose down
- Полная очистка с данными БД:
  - docker compose down -v

## Проверка

Через docker exec в контейнер БД:
- docker ps  (узнайте имя db-контейнера, например wb_test-db-1)
- docker exec -it wb_test-db-1 psql -U postgres -d postgres

Примеры запросов:
-- наличие таблиц
select to_regclass('public.wb_box_tariffs_daily_snapshots') as snapshots,
       to_regclass('public.wb_box_tariffs_daily_items') as items;

-- последний день
select max(day) as latest_day from wb_box_tariffs_daily_items;

-- распределение по типу доставки за последний день
select delivery_type, count(*)
from wb_box_tariffs_daily_items
where day = (select max(day) from wb_box_tariffs_daily_items)
group by 1
order by 1;

-- коэффициенты хранения: топ-10 c минимальным coef
select day, warehouse_name, region, coef
from wb_box_tariffs_daily_items
where day = (select max(day) from wb_box_tariffs_daily_items)
  and delivery_type = 'storage'
order by coef asc
limit 10;

Если вы хотите подключиться с хоста (DBeaver и т.п.), добавьте в docker-compose.yml для db секцию ports: ["5432:5432"] и перезапустите.

## Структура репозитория

wb-box-tariffs/
├─ docker-compose.yml
├─ Dockerfile
├─ .env.example
├─ README.md
├─ package.json
├─ tsconfig.json
├─ .gitignore
├─ .dockerignore
└─ src/
   ├─ app.ts
   ├─ config/
   │  └─ env.ts
   ├─ utils/
   │  ├─ logger.ts
   │  ├─ http.ts
   │  └─ hash.ts
   ├─ db/
   │  ├─ knex.ts
   │  └─ migrations/
   │     ├─ 202508250001_init.(ts|js)
   │     └─ ... (доп. миграции при изменении схемы)
   ├─ repositories/
   │  └─ tariffsRepo.ts
   ├─ domain/
   │  └─ wbBox.ts
   ├─ jobs/
   │  ├─ fetchWbBoxTariffs.ts
   │  └─ pushToSheets.ts
   └─ google/
      └─ sheets.ts

## Локальная разработка (опционально)

- Не через Docker:
  - Установите Node 20, локальный Postgres
  - Заполните .env (DB_HOST=localhost и т.д.)
  - npm i
  - npm run dev
- С миграциями:
  - При dev‑запуске можно использовать .ts‑миграции; в контейнере используются .js‑миграции, собранные в dist.

## Лицензия и безопасность

- Секреты (WB токен, Google ключ) не коммитятся. Используйте .env и/или docker secrets/volume‑mount.
- Репозиторий содержит .env.example и готов к запуску “из коробки” (сервис стартует; для загрузки данных требуется WB токен и Google Credentials).
# WB Box Tariffs: ETL -> PostgreSQL -> Google Sheets

Сервис:
- Ежечасно тянет тарифы WB (короба) и аккумулирует по дням в PostgreSQL
- Обновляет лист stocks_coefs в указанных Google Sheets (N таблиц по ID) с сортировкой по коэффициенту

## Запуск

1) Подготовьте .env
cp .env.example .env
- По умолчанию DB: postgres/postgres/postgres (по условию)
- Для prod обновления добавьте:
  - WB_API_TOKEN
  - GOOGLE_SHEETS_IDS=... (через запятую)
  - Креды сервисного аккаунта: либо GOOGLE_APPLICATION_CREDENTIALS (путь к файлу), либо GOOGLE_SERVICE_ACCOUNT_JSON (сырой JSON)
- В Google Sheets дайте доступ сервисному аккаунту (email из JSON) — Editor.

2) Запустите
docker compose up --build


Сервис:
- применит миграции,
- сразу выполнит первый цикл,
- затем повторяет раз в час.

Если WB_API_TOKEN не задан — включится демо: загрузит фикстуру и покажет, как всё работает (Google Sheets при этом можно выключить `GOOGLE_SHEETS_ENABLED=false`).

## Проверка

Войти в psql:
docker compose exec -it db psql -U postgres -d postgres


Посмотреть последние данные:
```sql
-- какой день актуален:
select max(day) as latest_day from wb_box_tariffs_daily_items;

-- сколько строк в этом дне:
select count(*) from wb_box_tariffs_daily_items
where day = (select max(day) from wb_box_tariffs_daily_items);

-- топ 10 по наименьшему коэффициенту:
select warehouse_id, warehouse_name, box_type, delivery_type, region_from, region_to, coef
from wb_box_tariffs_daily_items
where day = (select max(day) from wb_box_tariffs_daily_items)
order by coef asc
limit 10;
# Auto-Analytics: База данных + Ежедневный парсинг + Источник rolf.ru

Дата: 2026-09-05
Статус: Дизайн утверждён владельцем в брейнсторме

## Контекст и текущее состояние

`auto-analytics` — React-дашборд по рынку б/у авто в Москве. Сейчас:

- **Парсер** (`scraper/index.js`): Node.js + axios, JSON API major-expert.ru (`POST /api/v1/public/cars/items-by-url`), ~206 страниц, ~2470 объявлений. Отсекает дубли по `id`. Пишет `data/cars.json` (кэш) и дневной снапшот `data/history/YYYY-MM-DD.json`.
- **Дашборд** (`src/App.jsx`): импортирует `data/cars.json` при сборке (бандл). `PriceHistoryChart` читает `data/history/*.json` через `import.meta.glob` и строит динамику цен по дням.
- **Деплой**: GitHub Actions `deploy.yml` — на пуш в master по SSH: `git pull && npm install && node scraper/index.js && npm run build && systemctl reload nginx`. Парсинг запускается при деплое, а не ежедневно.
- **Данные**: у объявления уже есть поле `owners` (из API major-expert, `ch.owners?.value`), в карточках дашборда не показывается. На графике «Год vs Цена» `count` вычисляется (App.jsx:284-298), но не отображается.

## Цели

1. **База данных** для хранения предложений со всех сайтов-источников. Ежедневный парсинг складывает/обновляет предложения в БД, историю цен можно сравнивать (динамика цен в дашборде).
2. **Парсинг отдельно от деплоя/загрузки**: работает раз в день (cron) и пишет в БД. Сейчас парсинг запускается при деплое.
3. **Новый источник**: https://www.rolf.ru — раздел «Авто с пробегом» (`/cars/used/`).
4. Дашборд **читает данные напрямую из БД** через бэкенд API.
5. Мелкие фичи: количество предложений на графике «Год vs Цена»; количество владельцев в карточках объявлений.

## Декомпозиция

| Задача | Описание |
|--------|----------|
| T1 | База данных + ежедневный парсинг + бэкенд API + перевод дашборда на БД |
| T2 | Парсер rolf.ru (раздел «с пробегом») |
| T3 | Мелкие фичи дашборда (count на графике года, owners в карточках) |

Каждая задача — отдельный цикл разработки (TDD) и отдельная проверка. Порядок: T1 → T2 → T3.

---

# T1: База данных + ежедневный парсинг + бэкенд API

## Решения (из брейнсторма)

- **БД:** PostgreSQL, системный пакет на сервере (90.156.129.73) — НЕ в Docker, отдельная база от telegram_bot.
- **Расписание:** GitHub Actions cron-workflow раз в день (~03:00 МСК) → SSH → запуск парсеров на сервере → запись в БД.
- **Доступ к данным:** браузер не подключается к PostgreSQL напрямую. Добавляется небольшой Node/Express-бэкенд на том же сервере, отдающий JSON по `/api/*`. nginx проксирует `/api` → Express, статику `dist/` отдаёт как сейчас. Дашборд делает `fetch`.
- **Источники:** единый рынок. Данные всех источников лежат в одной схеме, дашборд фильтрует/группирует по `source`.

## Схема PostgreSQL

База: `auto_analytics`.

```sql
-- Таблица предложений (одна строка на объявление)
CREATE TABLE offers (
    id            BIGSERIAL PRIMARY KEY,
    source        TEXT NOT NULL,              -- 'major-expert' | 'rolf'
    source_id     TEXT NOT NULL,              -- id объявления на площадке
    url           TEXT,
    image         TEXT,
    brand         TEXT NOT NULL,
    model         TEXT,
    name          TEXT,
    year          INTEGER,
    mileage       INTEGER,
    body_type     TEXT,
    fuel_type     TEXT,
    engine_volume NUMERIC,
    horsepower    INTEGER,
    transmission  TEXT,
    drive_type    TEXT,
    color         TEXT,
    owners        INTEGER,
    is_new        BOOLEAN NOT NULL DEFAULT FALSE,
    price         BIGINT NOT NULL,            -- текущая цена, рубли
    old_price     BIGINT,                     -- зачёркнутая цена (скидка)
    first_seen    DATE NOT NULL DEFAULT CURRENT_DATE,
    last_seen     DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (source, source_id)
);

-- История цен: одна строка на объявление в день
CREATE TABLE price_history (
    id       BIGSERIAL PRIMARY KEY,
    offer_id BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    date     DATE NOT NULL DEFAULT CURRENT_DATE,
    price    BIGINT NOT NULL,
    old_price BIGINT,
    UNIQUE (offer_id, date)
);

CREATE INDEX idx_offers_brand ON offers(brand);
CREATE INDEX idx_offers_year  ON offers(year);
CREATE INDEX idx_offers_source_active ON offers(source, is_active);
CREATE INDEX idx_price_history_offer_date ON price_history(offer_id, date);
```

### Правила записи при ежедневном парсинге (транзакционно)

1. Для каждого нового объявления — INSERT в `offers` (или UPSERT по `(source, source_id)`), UPDATE полей, `last_seen = today`, `is_active = true`.
2. INSERT в `price_history` на пару `(offer_id, today)` (UPSERT — на случай повторного запуска в день; при повторном запуске перезаписываются `price`/`old_price` дневной записи).
3. Все объявления источника, не встреченные сегодня (нет в текущем парсе), помечаются `is_active = false` (в рамках мёрджа источника).
4. «Текущая цена» в дашборде = `offers.price` (последний парсинг). История = `price_history`.

## Парсинг: ежедневно (GitHub Actions cron)

- Отдельный workflow `.github/workflows/scrape-daily.yml`: `schedule: cron '0 0 * * *'` (00:00 UTC = 03:00 МСК).
- Job: SSH на сервер → `cd /var/www/auto-analytics/app && node scraper/index.js && node scraper/rolf.js`.
- Парсеры перерабатываются: читают API, нормализуют в единый формат, пишут в PostgreSQL через `pg` (модуль `scraper/db.js`). Больше не пишут `data/cars.json` при ежедневном парсинге (или пишут как резервный кэш, см. ниже).
- Существующий `deploy.yml` остаётся: только код (убрать запуск парсера из него — парсинг теперь по cron).
- DSN через env `DATABASE_URL` (например `postgres://auto:…@localhost:5432/auto_analytics`), в `.env` на сервере.

### Миграции / создание схемы

- Скрипт `scraper/migrate.js` (`node scraper/migrate.js`): создаёт таблицы, если их нет (идиомпотентно, `CREATE TABLE IF NOT EXISTS`). Вызывается в cron-workflow перед парсингом.
- Избыточной ORM не вводим — сырой `pg` + структурированные SQL-запросы.

## Бэкенд API

- Новый модуль `server/` (Express): `server/index.js`, запуск `node server/index.js` на порту `3001`, системный сервис (systemd unit `auto-analytics-api.service`), перезапускается вместе с сервером.
- Эндпоинты:
  - `GET /api/offers` — активные предложения: все источники сразу, фильтры `?source=&brand=&yearFrom=&yearTo=&limit=`. Метаданные: `total`, `avgPrice` считаются на сервере или на клиенте (выбор за реализующей стороной — минимум, чтобы не переписывать лишнее в UI).
  - `GET /api/history?date=&brand=&source=` — агрегат по `price_history` для графика динамики цен.
  - `GET /api/meta` — список источников, доступных марок/годов (для фильтров).
- Express отдаёт `maxAge`-заголовки по минимуму; CORS не нужен (тот же origin через nginx-прокси).
- nginx: `location /api/ { proxy_pass http://127.0.0.1:3001; }`.

## Фронтенд

- `src/App.jsx`: заменить `import rawData from '../data/cars.json'` на `fetch('/api/offers')` в `useEffect` + стейт/`useMemo`. Расчёты из `calculateScore` и остальной код сохраняются.
- `PriceHistoryChart`: читает `fetch('/api/history')` вместо `import.meta.glob('/data/history/*.json')`.
- Убрать `data/history/*.json`-механизм из фронта (или оставить как fallback при недоступном API — решить при реализации; по умолчанию: fetch с ошибкой без fallback).
- Фильтр по источнику (селект «Все источники / major-expert / rolf») — единый рынок по умолчанию.

## Обработка ошибок и устойчивость

- Парсер: таймауты axios как сейчас (15с), задержка 300мс между запросами, retry-логика простым повтором (1 попытка) при сетевой ошибке на страницу.
- Если парсинг дня упал (например, невалидный ответ API): ошибка в лог, предыдущие данные в БД не трогаются (транзакция per-источник через `BEGIN/COMMIT/ROLLBACK`).
- `price_history` за день перезаписывается при повторном запуске в тот же день — повторный запуск безвреден.
- Cron-вокфлоу: `failure` ведёт в консоль GitHub Actions; сервер и дашборд продолжают показывать последние данные.

## Тестирование (T1)

- Юнит-тесты парсера: нормализация ответа API major-expert → строка `offers`; дедупликация.
- Юнит-тесты функций записи в БД: UPSERT, маркировка `is_active=false`, запись `price_history`.
- Вит-тесты фронта: `App.test.jsx`/`PriceHistoryChart.test.jsx` адаптировать под fetch (mock `fetch`), проверить рендер после загрузки.

---

# T2: Парсер rolf.ru

## Разведка (feasibility)

- rolf.ru — Nuxt SPA. Конфиг `APP_API_URL = https://apiweb.rolf.ru/`, JSON API есть (подтверждено в бандле Nuxt, путь `/api/v2/...`).
- Точный endpoint для «Авто с пробегом» (`/cars/used/`) при финальном дизайне не утверждён: найдём спайком в начале реализации (пробуем известные паттерны, при неудаче — парсим HTML через cheerio, который уже в зависимостях).
- Раздел: только «Авто с пробегом» (`/cars/used/`).

## Реализация

- Новый `scraper/rolf.js` по образцу `scraper/index.js`: пагинация, дедупликация, задержка 300мс, UA-браузерный, таймаут 15с.
- Нормализация в общую схему `offers` с `source: 'rolf'`: brand, model, year, mileage, body_type, fuel_type, engine_volume, horsepower, transmission, drive_type, price, url, image, owners (если отдаёт API, иначе null).
- Запись в БД через тот же `scraper/db.js`.
- CLI-флаг `--pages=N` для теста (как в major-expert).
- Если endpoint ненадёжен — HTML-парсинг черио: `https://www.rolf.ru/cars/used/` (SSR-HTML ~827КБ), карточки с данными объявлений.

## Фича дашборда

- Селект источника «major-expert / rolf» и единый рынок по умолчанию (T1 закладывает поле `source`).
- Подпись в шапке «Данные с major-expert.ru» становится динамической по активному источнику.

## Тестирование (T2)

- Тест нормализации rolf-ответа → строка `offers` (фикстура реального ответа).
- Проверка, что `source: 'rolf'` проставляет корректно и `UNIQUE(source, source_id)` не конфликтует с major-expert.

---

# T3: Мелкие фичи дашборда

1. **Количество предложений на графике «Год выпуска vs Средняя цена»:** в `yearVsPrice` уже есть `count` (App.jsx:292). Показать:
   - в тултипе при наведении на точку (`count` рядом с ценой);
   - опционально — подпись над точкой (`n`).
   Объём: правка `Tooltip`/`Line` у `LineChart` (App.jsx:462-472) + тест.
2. **Количество владельцев в карточках объявлений:** `DealCard` (жетоны лучших/малоездных) и аналоги — добавить строку «N владелец/владельца/владельцев» (склонение, как в `formatMileage`/`formatAnnual`). В sample-данных есть `owners` почти у всех, у реальных major-expert тоже. Если `owners` null/undefined — не показывать.

## Тестирование (T3)

- Юнит-тест утилиты склонения по числу владельцев.
- Вит-тест: карточка рендерит «2 владельца» при `owners=2`, ничего при `owners=null`.

---

## Что вне скоупа

- ML-прогноз справедливой цены, алерты «цена упала», модель амортизации, сравнение с Авито/Авто.ру, телеграм-бот (идеи из README).
- Парсинг новых авто с rolf.ru (только «с пробегом»).
- Рефакторинг `App.jsx` на компоненты (TechDebt из README) — кроме правок, нужных для фич.

## Риски

- Rolf-API может не отдавать `owners`/`engineVolume` в списке — поле станет `null` в БД, фича владельцев по rolf не покажется (мажо-expert — покажется).
- Публикация rolf-API может измениться (антибот, смена endpoint) — парсер заложен так, что его легко заменить/починить точечно (изолированный модуль, бережливость к внешнему API: задержки, таймауты).
- nginx на сервере нужно донастроить (прокси `/api`) — учтено в плане деплоя; для этого ветки достаточно прав, что на сервере уже есть (sudo через деплой).
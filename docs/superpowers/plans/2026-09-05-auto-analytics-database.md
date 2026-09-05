# T1: База данных + ежедневный парсинг + бэкенд API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Хранить предложения авто из major-expert.ru в PostgreSQL, парсить их по cron раз в день отдельно от деплоя, и отдавать дашборду данные (объявления, историю цен) через Node/Express API.

**Architecture:** Схема PostgreSQL (`offers` — одна строка на объявление с `is_active`; `price_history` — строка на объявление в день) создаётся скриптом `scraper/migrate.js`. Парсер `scraper/index.js` синхронизирует major-expert в БД транзакционно (UPSERT объявлений + история цен + деактивация пропавших). Небольшой Express-сервер на порту 3001 читает БД и отдаёт `/api/offers`, `/api/history`, `/api/meta`. Дашборд вместо импорта `cars.json` делает `fetch` к API. nginx проксирует `/api` → Express.

**Tech Stack:** Node 22 (type: module), Express 5, pg (Pool), vitest + @testing-library/react, supertest.

**Spec:** `docs/superpowers/specs/2026-09-05-auto-analytics-database-design.md`

## Global Constraints

- Проект ESM (`"type": "module"`): все новые модули — ESM, импорты с расширением `.js`.
- Схема и имена колонок — ровно из спецификации (snake_case в БД): `offers(source, source_id, url, image, brand, model, name, year, mileage, body_type, fuel_type, engine_volume, horsepower, transmission, drive_type, color, owners, is_new, price, old_price, first_seen, last_seen, is_active)`, `price_history(offer_id, date, price, old_price)`, `UNIQUE(source, source_id)`, `UNIQUE(offer_id, date)`.
- Источник major-expert = строка `'major-expert'`. В свойствах API дашборд получает camelCase (как сейчас в `cars.json`), включая новое поле `source`.
- Тесты — vitest; файлы БД/сервера помечаются `// @vitest-environment node`.
- Rate limit API major-expert: 300мс между запросами, браузерный User-Agent, таймаут 15с (без изменений).
- Секреты/ключи в репо не коммитим. `data/cars.json` остаётся резервным кэшем парсера (gitignored).
- Никакой ORM: только `pg` + структурированные SQL. Новые зависимости — только `express`, `pg`, `supertest`.

---

### Task 1: Зависимости сервера и БД

**Files:**
- Modify: `package.json`
- Verify: `npm test`

**Interfaces:**
- Consumes: ничего.
- Produces: скрипты `npm run migrate`, `npm run server`; доступны модули `express`, `pg`, `supertest`.

- [ ] **Step 1: Добавить зависимости и скрипты в `package.json`**

В блок `"dependencies"` добавить:
```json
"express": "^5.1.0",
"pg": "^8.16.0"
```
В блок `"devDependencies"`:
```json
"supertest": "^7.1.0"
```
В `"scripts"` добавить после `"test:watch"`:
```json
"migrate": "AUTO_MIGRATE=1 node scraper/migrate.js",
"server": "node server/index.js"
```
> `AUTO_MIGRATE=1` — признак запуска CLI (см. Task 3). Синтаксис `VAR=1 cmd` работает в npm-скриптах на macOS/Linux; сервер — Linux.

- [ ] **Step 2: Установить зависимости**

Run: `npm install`
Expected: `express`, `pg`, `supertest` в `node_modules`. Проверить: `npm ls pg express supertest`.

- [ ] **Step 3: Проверить, что тесты зелёные**

Run: `npm test`
Expected: 62 теста проходят.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express, pg, supertest deps and migrate/server scripts"
```

---

### Task 2: `scraper/db.js` — схема, маппинг, синхронизация и чтение

**Files:**
- Create: `scraper/db.js`
- Test: `test/db.test.js`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `offerToRow(car, source)` → snake_case-строка объявления (чистая функция)
  - `buildOfferQuery(filters)` → `{ where, params }` (чистая функция)
  - `createPool(dsn)` → `pg.Pool`
  - `initSchema(pool)` → создаёт таблицы/индексы
  - `applySync(pool, { source, cars, today })` → `{ inserted, updated, deactivated }`
  - `getOffers(pool, filters)` → массив rows активных объявлений
  - `getHistory(pool, { source })` → массив `{ date, brand, model, price }`
  - `getMeta(pool)` → `{ sources, brands, years }`

- [ ] **Step 1: Написать падающий тест для чистых функций**

Создать `test/db.test.js`:
```js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { offerToRow, buildOfferQuery, initSchema, applySync, getOffers, getHistory } from '../scraper/db.js';

describe('offerToRow', () => {
  it('маппит camelCase объявление в snake_case строку БД', () => {
    const car = {
      id: 42, brand: 'BMW', model: 'X4', name: 'X4 (G02/F98)',
      year: 2024, mileage: 7363, bodyType: 'Внедорожник', fuelType: 'Бензин',
      engineVolume: 2, horsepower: 245, transmission: 'АКПП (автомат)',
      driveType: 'Полный привод', color: 'серый', owners: 1,
      price: 7700000, oldPrice: null, isNew: false,
      url: 'https://major-expert.ru/car/42', image: 'img.jpg',
    };
    const row = offerToRow(car, 'major-expert');
    expect(row.source).toBe('major-expert');
    expect(row.source_id).toBe('42');
    expect(row.body_type).toBe('Внедорожник');
    expect(row.fuel_type).toBe('Бензин');
    expect(row.engine_volume).toBe(2);
    expect(row.drive_type).toBe('Полный привод');
    expect(row.is_new).toBe(false);
    expect(row.price).toBe(7700000);
    expect(row.old_price).toBeNull();
  });

  it('корректно обрабатывает отсутствующие поля (null)', () => {
    const row = offerToRow({ id: 1, brand: 'Lada', model: null, price: 800000 }, 'major-expert');
    expect(row.model).toBeNull();
    expect(row.year).toBeNull();
    expect(row.owners).toBeNull();
    expect(row.is_new).toBe(false);
  });
});

describe('buildOfferQuery', () => {
  it('без фильтров выбирает только активные', () => {
    const { where, params } = buildOfferQuery({});
    expect(where).toBe('is_active = TRUE');
    expect(params).toEqual([]);
  });

  it('накладывает фильтры source, brand, yearFrom, yearTo', () => {
    const { where, params } = buildOfferQuery({ source: 'rolf', brand: 'BMW', yearFrom: '2020', yearTo: '2024' });
    expect(where).toContain('is_active = TRUE');
    expect(where).toContain('source = $1');
    expect(where).toContain('brand = $2');
    expect(where).toContain('year >= $3');
    expect(where).toContain('year <= $4');
    expect(params).toEqual(['rolf', 'BMW', 2020, 2024]);
  });

  it('числовые фильтры преобразует в Number', () => {
    const { params } = buildOfferQuery({ yearFrom: '2020' });
    expect(params[0]).toBe(2020);
  });
});
```

- [ ] **Step 2: Запустить тест — проверить, что падает**

Run: `npx vitest run test/db.test.js`
Expected: FAIL — `Cannot find module '../scraper/db.js'`.

- [ ] **Step 3: Реализовать чистые функции в `scraper/db.js`**

Создать `scraper/db.js`:
```js
// Data layer: PostgreSQL schema, mapping and sync for auto-analytics.
import pg from 'pg';

const { Pool } = pg;

export function offerToRow(car, source) {
  return {
    source,
    source_id: String(car.id),
    url: car.url || null,
    image: car.image || null,
    brand: car.brand,
    model: car.model || null,
    name: car.name || null,
    year: car.year ?? null,
    mileage: car.mileage ?? null,
    body_type: car.bodyType ?? null,
    fuel_type: car.fuelType ?? null,
    engine_volume: car.engineVolume ?? null,
    horsepower: car.horsepower ?? null,
    transmission: car.transmission ?? null,
    drive_type: car.driveType ?? null,
    color: car.color ?? null,
    owners: car.owners ?? null,
    is_new: Boolean(car.isNew),
    price: car.price,
    old_price: car.oldPrice ?? null,
  };
}

export function buildOfferQuery(filters = {}) {
  const where = ['is_active = TRUE'];
  const params = [];
  const push = (col, op, value) => {
    params.push(value);
    where.push(`${col} ${op} $${params.length}`);
  };
  if (filters.source) push('source', '=', filters.source);
  if (filters.brand) push('brand', '=', filters.brand);
  if (filters.yearFrom) push('year', '>=', Number(filters.yearFrom));
  if (filters.yearTo) push('year', '<=', Number(filters.yearTo));
  return { where: where.join(' AND '), params };
}

export function createPool(dsn) {
  return new Pool({ connectionString: dsn });
}
```

- [ ] **Step 4: Запустить тест — проверить, что проходит**

Run: `npx vitest run test/db.test.js`
Expected: PASS (6 тестов чистых функций).

- [ ] **Step 5: Добавить схему, синхронизацию и чтение в `scraper/db.js`**

Дописать в конец `scraper/db.js`:
```js
const SCHEMA = `
CREATE TABLE IF NOT EXISTS offers (
    id            BIGSERIAL PRIMARY KEY,
    source        TEXT NOT NULL,
    source_id     TEXT NOT NULL,
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
    price         BIGINT NOT NULL,
    old_price     BIGINT,
    first_seen    DATE NOT NULL DEFAULT CURRENT_DATE,
    last_seen     DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS price_history (
    id        BIGSERIAL PRIMARY KEY,
    offer_id  BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    date      DATE NOT NULL DEFAULT CURRENT_DATE,
    price     BIGINT NOT NULL,
    old_price BIGINT,
    UNIQUE (offer_id, date)
);

CREATE INDEX IF NOT EXISTS idx_offers_brand ON offers(brand);
CREATE INDEX IF NOT EXISTS idx_offers_year ON offers(year);
CREATE INDEX IF NOT EXISTS idx_offers_source_active ON offers(source, is_active);
CREATE INDEX IF NOT EXISTS idx_price_history_offer_date ON price_history(offer_id, date);
`;

const UPSERT_OFFER = `
INSERT INTO offers (source, source_id, url, image, brand, model, name, year, mileage,
  body_type, fuel_type, engine_volume, horsepower, transmission, drive_type, color,
  owners, is_new, price, old_price, last_seen, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, TRUE)
ON CONFLICT (source, source_id) DO UPDATE SET
  url = EXCLUDED.url, image = EXCLUDED.image, brand = EXCLUDED.brand, model = EXCLUDED.model,
  name = EXCLUDED.name, year = EXCLUDED.year, mileage = EXCLUDED.mileage, body_type = EXCLUDED.body_type,
  fuel_type = EXCLUDED.fuel_type, engine_volume = EXCLUDED.engine_volume, horsepower = EXCLUDED.horsepower,
  transmission = EXCLUDED.transmission, drive_type = EXCLUDED.drive_type, color = EXCLUDED.color,
  owners = EXCLUDED.owners, is_new = EXCLUDED.is_new, price = EXCLUDED.price, old_price = EXCLUDED.old_price,
  last_seen = EXCLUDED.last_seen, is_active = TRUE
RETURNING id, source_id, (xmax = 0) AS is_new_row;
`;

const INSERT_HISTORY = `
INSERT INTO price_history (offer_id, date, price, old_price)
VALUES ($1, $2::date, $3, $4)
ON CONFLICT (offer_id, date) DO UPDATE SET
  price = EXCLUDED.price,
  old_price = EXCLUDED.old_price;
`;

const DEACTIVATE = `
UPDATE offers SET is_active = FALSE
WHERE source = $1 AND is_active AND NOT (source_id = ANY($2::text[]));
`;

export async function initSchema(pool) {
  await pool.query(SCHEMA);
}

export async function applySync(pool, { source, cars, today }) {
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let deactivated = 0;
  try {
    await client.query('BEGIN');
    const saved = [];
    for (const car of cars) {
      const r = offerToRow(car, source);
      const { rows } = await client.query(UPSERT_OFFER, [
        r.source, r.source_id, r.url, r.image, r.brand, r.model, r.name, r.year, r.mileage,
        r.body_type, r.fuel_type, r.engine_volume, r.horsepower, r.transmission, r.drive_type,
        r.color, r.owners, r.is_new, r.price, r.old_price, today,
      ]);
      saved.push({ id: Number(rows[0].id), car });
      if (rows[0].is_new_row) inserted++; else updated++;
    }
    for (const { id, car } of saved) {
      await client.query(INSERT_HISTORY, [id, today, car.price, car.oldPrice ?? null]);
    }
    const { rowCount } = await client.query(DEACTIVATE, [source, cars.map(c => String(c.id))]);
    deactivated = rowCount;
    await client.query('COMMIT');
    return { inserted, updated, deactivated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getOffers(pool, filters = {}) {
  const { where, params } = buildOfferQuery(filters);
  const { rows } = await pool.query(`SELECT * FROM offers WHERE ${where} ORDER BY id`, params);
  return rows;
}

export async function getHistory(pool, { source } = {}) {
  const params = [];
  let sourceWhere = '';
  if (source) {
    params.push(source);
    sourceWhere = 'WHERE o.source = $1';
  }
  const { rows } = await pool.query(
    `SELECT to_char(h.date, 'YYYY-MM-DD') AS date, o.brand, o.model, h.price
     FROM price_history h
     JOIN offers o ON o.id = h.offer_id
     ${sourceWhere}
     ORDER BY h.date`,
    params,
  );
  return rows;
}

export async function getMeta(pool) {
  const sources = (await pool.query('SELECT DISTINCT source FROM offers ORDER BY source')).rows.map(r => r.source);
  const brands = (await pool.query('SELECT DISTINCT brand FROM offers ORDER BY brand')).rows.map(r => r.brand);
  const years = (await pool.query('SELECT DISTINCT year FROM offers WHERE year IS NOT NULL ORDER BY year DESC')).rows.map(r => r.year);
  return { sources, brands, years };
}
```

- [ ] **Step 6: Добавить интеграционный тест `applySync`/`initSchema`**

Дописать в конец `test/db.test.js`:
```js
describe('applySync (интеграция с PostgreSQL)', () => {
  const dsn = process.env.DATABASE_URL;
  const itDb = dsn ? it : it.skip;

  itDb('upsert, история цен и деактивация пропавших', async () => {
    const pool = new (await import('pg')).Pool({ connectionString: dsn });
    await initSchema(pool);

    await applySync(pool, {
      source: 'major-expert',
      cars: [
        { id: 1, brand: 'BMW', model: 'X4', price: 5000000, isNew: false },
        { id: 2, brand: 'Audi', model: 'Q7', price: 4000000, isNew: false },
      ],
      today: '2026-09-05',
    });

    const offers = await getOffers(pool, {});
    expect(offers.map(o => o.source_id).sort()).toEqual(['1', '2']);
    const history = await getHistory(pool, {});
    expect(history.length).toBe(2);
    expect(history.every(r => r.date === '2026-09-05')).toBe(true);

    const res1 = await applySync(pool, {
      source: 'major-expert',
      cars: [{ id: 1, brand: 'BMW', model: 'X4', price: 4900000, isNew: false }],
      today: '2026-09-05',
    });
    expect(res1.inserted).toBe(0);
    expect(res1.updated).toBe(1);
    const active = await getOffers(pool, {});
    expect(active).toHaveLength(1); // id=2 деактивирован
    expect(active[0].price).toBe('4900000'); // pg отдаёт BIGINT строкой
    const lastHistory = (await getHistory(pool, {})).filter(r => r.brand === 'BMW');
    expect(lastHistory).toHaveLength(1); // UNIQUE(offer_id,date) — перезаписан, не дублирован
    expect(lastHistory[0].price).toBe('4900000');
  });
});
```
> `pg` возвращает `BIGINT` и `BIGSERIAL` как строки. При необходимости сравнения приводить `String(active[0].price)` — см. Task 4 (`offerRowToCar` приводит к `Number`).
> Если PostgreSQL локально недоступен — блок уходит в SKIP, блокеры нет (реальная проверка в Task 10).

- [ ] **Step 7: Полный прогон юнит-тестов**

Run: `npm test`
Expected: 62 базовых + новые проходят; интеграционный блок SKIP без `DATABASE_URL`.

- [ ] **Step 8: Commit**

```bash
git add scraper/db.js test/db.test.js
git commit -m "feat: add PostgreSQL data layer with schema, offer sync and reads"
```

---

### Task 3: `scraper/migrate.js` + переключение `scraper/index.js` на БД

**Files:**
- Create: `scraper/migrate.js`
- Modify: `scraper/index.js`
- Test: `test/scraper.test.js`

**Interfaces:**
- Consumes: `createPool`, `initSchema`, `applySync` из `scraper/db.js`.
- Produces: CLI `node scraper/migrate.js` (создаёт схему при `AUTO_MIGRATE=1`); `scraper/index.js` пишет `data/cars.json` (кэш) и синхронизирует major-expert в БД, если задан `DATABASE_URL`.

- [ ] **Step 1: Написать тест на `runMigrate`**

Создать `test/scraper.test.js`:
```js
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { runMigrate } from '../scraper/migrate.js';

describe('runMigrate', () => {
  it('вызывает initSchema и закрывает пул', async () => {
    const initSchema = vi.fn().mockResolvedValue(undefined);
    const pool = { end: vi.fn().mockResolvedValue(undefined) };
    await runMigrate(pool, initSchema);
    expect(initSchema).toHaveBeenCalledWith(pool);
    expect(pool.end).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Запустить тест — проверить, что падает**

Run: `npx vitest run test/scraper.test.js`
Expected: FAIL — модуль `../scraper/migrate.js` не существует.

- [ ] **Step 3: Реализовать `scraper/migrate.js`**

Создать `scraper/migrate.js`:
```js
import { createPool, initSchema } from './db.js';

export async function runMigrate(pool, init = initSchema) {
  await init(pool);
  await pool.end();
  console.log('Схема PostgreSQL готова');
}

if (process.env.AUTO_MIGRATE === '1') {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    console.error('DATABASE_URL не задан — миграция пропущена');
    process.exit(1);
  }
  runMigrate(createPool(dsn)).catch(err => {
    console.error('Ошибка при создании схемы:', err.message);
    process.exit(1);
  });
}
```
> При импорте модуля из теста CLI-блок не выполняется (нет `AUTO_MIGRATE=1`).

- [ ] **Step 4: Запустить тест — проверить, что проходит**

Run: `npx vitest run test/scraper.test.js`
Expected: PASS.

- [ ] **Step 5: Подключить БД в `scraper/index.js`**

В `scraper/index.js`:
1. Вверху файла добавить импорт:
```js
import { createPool, initSchema, applySync } from './db.js';
```
2. После записи `data/cars.json` (внутри `scrapeAll`, ниже `fs.writeFileSync(mainPath, ...)`) добавить:
```js
  if (process.env.DATABASE_URL) {
    const pool = createPool(process.env.DATABASE_URL);
    try {
      await initSchema(pool);
      const result = await applySync(pool, { source: 'major-expert', cars: uniqueCars, today });
      console.log(`DB sync: ${result.inserted} new, ${result.updated} updated, ${result.deactivated} deactivated`);
    } finally {
      await pool.end();
    }
  } else {
    console.log('DATABASE_URL не задан — сохранён только кэш cars.json');
  }
```
> `today` уже вычисляется выше в `scrapeAll`. `initSchema` внутри парсера — страховка на случай отсутствия отдельного `migrate`.

- [ ] **Step 6: Смоук-прогон парсера без БД**

Run: `npm run scrape:quick`
Expected: парсинг 5 страниц, `data/cars.json` обновлён, в логе `DATABASE_URL не задан — сохранён только кэш cars.json`.
> Реальный сетевой запрос к major-expert.ru (≈1-2 мин с задержками). Если сеть недоступна — пропустить, это не блокер.

- [ ] **Step 7: Полный прогон тестов**

Run: `npm test`
Expected: все PASS (интеграционные блоки SKIP без DATABASE_URL).

- [ ] **Step 8: Commit**

```bash
git add scraper/migrate.js scraper/index.js test/scraper.test.js
git commit -m "feat: migrate CLI and scrape into PostgreSQL when DATABASE_URL set"
```

---

### Task 4: `server/serialize.js` — сериализация БД → API

**Files:**
- Create: `server/serialize.js`
- Test: `test/serialize.test.js`

**Interfaces:**
- Consumes: ничего.
- Produces: `offerRowToCar(row)` → camelCase-объект (как в старом `cars.json` + `source`); `historyRowsToDays(rows)` → `{ dates, byDate }`.

- [ ] **Step 1: Написать падающий тест**

Создать `test/serialize.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { offerRowToCar, historyRowsToDays } from '../server/serialize.js';

describe('offerRowToCar', () => {
  it('преобразует snake_case строку БД в camelCase объявление дашборда', () => {
    const car = offerRowToCar({
      id: '5', source: 'major-expert', source_id: '42', url: 'u', image: 'i',
      brand: 'BMW', model: 'X4', name: 'X4 (G02/F98)', year: 2024, mileage: 7363,
      body_type: 'Внедорожник', fuel_type: 'Бензин', engine_volume: '2', horsepower: 245,
      transmission: 'АКПП (автомат)', drive_type: 'Полный привод', color: 'серый',
      owners: 1, is_new: false, price: '7700000', old_price: null,
    });
    expect(car.source).toBe('major-expert');
    expect(car.bodyType).toBe('Внедорожник');
    expect(car.fuelType).toBe('Бензин');
    expect(car.engineVolume).toBe(2); // NUMERIC возвращается строкой -> Number
    expect(car.driveType).toBe('Полный привод');
    expect(car.engineVolume).toBe(2);
    expect(car.isNew).toBe(false);
    expect(car.price).toBe(7700000);
    expect(car.oldPrice).toBeNull();
  });
});

describe('historyRowsToDays', () => {
  it('группирует строки истории по датам', () => {
    const { dates, byDate } = historyRowsToDays([
      { date: '2026-09-05', brand: 'BMW', model: 'X4', price: '5000000' },
      { date: '2026-09-05', brand: 'Audi', model: 'Q7', price: '4000000' },
      { date: '2026-09-06', brand: 'BMW', model: 'X4', price: '4900000' },
    ]);
    expect(dates).toEqual(['2026-09-05', '2026-09-06']);
    expect(byDate['2026-09-05']).toHaveLength(2);
    expect(byDate['2026-09-06'][0].price).toBe(4900000);
  });

  it('пустой вход -> пустой результат', () => {
    expect(historyRowsToDays([])).toEqual({ dates: [], byDate: {} });
  });
});
```

- [ ] **Step 2: Запустить тест — проверить, что падает**

Run: `npx vitest run test/serialize.test.js`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализовать `server/serialize.js`**

Создать `server/serialize.js`:
```js
// Преобразование строк БД в JSON-формат дашборда (camelCase, как в data/cars.json).
export function offerRowToCar(row) {
  return {
    id: Number(row.id),
    source: row.source,
    brand: row.brand,
    model: row.model,
    name: row.name,
    year: row.year,
    mileage: row.mileage,
    bodyType: row.body_type,
    fuelType: row.fuel_type,
    engineVolume: row.engine_volume != null ? Number(row.engine_volume) : null,
    horsepower: row.horsepower,
    transmission: row.transmission,
    driveType: row.drive_type,
    color: row.color,
    owners: row.owners,
    price: Number(row.price),
    oldPrice: row.old_price != null ? Number(row.old_price) : null,
    isNew: row.is_new,
    url: row.url,
    image: row.image,
  };
}

export function historyRowsToDays(rows) {
  const byDate = {};
  rows.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push({ brand: r.brand, model: r.model, price: Number(r.price) });
  });
  return { dates: Object.keys(byDate).sort(), byDate };
}
```

- [ ] **Step 4: Запустить тест — проверить, что проходит**

Run: `npx vitest run test/serialize.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/serialize.js test/serialize.test.js
git commit -m "feat: serialize DB rows to dashboard JSON format"
```

---

### Task 5: Express API `server/app.js` + `server/index.js`

**Files:**
- Create: `server/app.js`, `server/index.js`
- Test: `test/api.test.js`

**Interfaces:**
- Consumes: `offerRowToCar`, `historyRowsToDays` из `server/serialize.js`; `getOffers`, `getHistory`, `getMeta`, `createPool` из `scraper/db.js`.
- Produces: `createApp(db)` — Express-приложение (инжектируется объект `db`):
  - `GET /api/health` → `{ ok: true }`
  - `GET /api/meta` → `{ sources, brands, years }`
  - `GET /api/offers?source=&brand=&yearFrom=&yearTo=` → массив объявлений (camelCase с `source`)
  - `GET /api/history?source=` → `{ dates, byDate }`
  - error-handler → `500 { error: 'internal error' }`

- [ ] **Step 1: Написать падающий тест (supertest + фейковый db)**

Создать `test/api.test.js`:
```js
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

function makeDb(overrides = {}) {
  return {
    getOffers: async () => ([{
      id: 1, source: 'major-expert', brand: 'BMW', model: 'X4', name: 'X4',
      year: 2024, mileage: 7363, body_type: 'Внедорожник', fuel_type: 'Бензин',
      engine_volume: '2', horsepower: 245, transmission: 'АКПП', drive_type: 'Полный привод',
      color: 'серый', owners: 1, is_new: false, price: '7700000', old_price: null,
      url: 'u', image: 'i',
    }]),
    getHistory: async () => ([{ date: '2026-09-05', brand: 'BMW', model: 'X4', price: '7700000' }]),
    getMeta: async () => ({ sources: ['major-expert'], brands: ['BMW'], years: [2024] }),
    ...overrides,
  };
}

describe('API', () => {
  it('GET /api/health возвращает ok', async () => {
    const res = await request(createApp(makeDb())).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/meta возвращает метаданные', async () => {
    const res = await request(createApp(makeDb())).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body.brands).toEqual(['BMW']);
  });

  it('GET /api/offers сериализует объявления в camelCase', async () => {
    const res = await request(createApp(makeDb())).get('/api/offers');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ brand: 'BMW', bodyType: 'Внедорожник', isNew: false, price: 7700000, source: 'major-expert' });
  });

  it('GET /api/history возвращает сгруппированную историю', async () => {
    const res = await request(createApp(makeDb())).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body.dates).toEqual(['2026-09-05']);
    expect(res.body.byDate['2026-09-05']).toHaveLength(1);
  });

  it('GET /api/offers передаёт фильтры в getOffers', async () => {
    const getOffers = vi.fn().mockResolvedValue([]);
    await request(createApp(makeDb({ getOffers }))).get('/api/offers?source=rolf&brand=BMW&yearFrom=2020&yearTo=2024');
    expect(getOffers).toHaveBeenCalledWith(expect.objectContaining({ source: 'rolf', brand: 'BMW', yearFrom: '2020', yearTo: '2024' }));
  });

  it('при ошибке БД возвращает 500', async () => {
    const db = makeDb({ getOffers: async () => { throw new Error('db down'); } });
    const res = await request(createApp(db)).get('/api/offers');
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Запустить тест — проверить, что падает**

Run: `npx vitest run test/api.test.js`
Expected: FAIL — `Cannot find module '../server/app.js'`.

- [ ] **Step 3: Реализовать `server/app.js`**

Создать `server/app.js`:
```js
import express from 'express';
import { offerRowToCar, historyRowsToDays } from './serialize.js';

export function createApp(db) {
  const app = express();

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/meta', async (req, res, next) => {
    try {
      res.json(await db.getMeta());
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/offers', async (req, res, next) => {
    try {
      const filters = {
        source: req.query.source || undefined,
        brand: req.query.brand || undefined,
        yearFrom: req.query.yearFrom || undefined,
        yearTo: req.query.yearTo || undefined,
      };
      const rows = await db.getOffers(filters);
      res.json(rows.map(offerRowToCar));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/history', async (req, res, next) => {
    try {
      const rows = await db.getHistory({ source: req.query.source || undefined });
      res.json(historyRowsToDays(rows));
    } catch (err) {
      next(err);
    }
  });

  // error-handler: обязательны 4 аргумента, иначе Express не считает его таковым
  app.use((err, req, res, next) => {
    console.error('API error:', err.message);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}
```

- [ ] **Step 4: Реализовать `server/index.js`**

Создать `server/index.js`:
```js
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createApp } from './app.js';
import { createPool, getOffers, getHistory, getMeta } from '../scraper/db.js';

const PORT = Number(process.env.PORT || 3001);
const dsn = process.env.DATABASE_URL;

if (!dsn) {
  console.error('DATABASE_URL не задан — API не запущен');
  process.exit(1);
}

const pool = createPool(dsn);
const db = {
  getOffers: filters => getOffers(pool, filters),
  getHistory: ({ source }) => getHistory(pool, { source }),
  getMeta: () => getMeta(pool),
};

const app = createApp(db);

// Подстраховка: статику отдаём из Express, если dist собран.
// Штатно статику отдаёт nginx, а /api проксируется на этот сервис.
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`Auto-analytics API on http://127.0.0.1:${PORT}`);
});
```

- [ ] **Step 5: Запустить тест — проверить, что проходит**

Run: `npx vitest run test/api.test.js`
Expected: PASS (6 тестов).

- [ ] **Step 6: Смоук-проверка `server/index.js`**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/auto_analytics node server/index.js & sleep 1; curl -s http://127.0.0.1:3001/api/health; kill %1`
Expected: `{"ok":true}`.
> Если локальной БД нет — пропустить, проверяется в Task 10.

- [ ] **Step 7: Commit**

```bash
git add server/app.js server/index.js test/api.test.js
git commit -m "feat: Express API for offers/history/meta over PostgreSQL"
```

---

### Task 6: Дашборд читает данные из API

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/App.scatter.test.jsx`

**Interfaces:**
- Consumes: эндпоинты из Task 5.
- Produces: дашборд без `import data/cars.json` — данные из `fetch('/api/offers')` и `fetch('/api/history')`; сабтайтл «N объявлений» вместо «… • Данные с major-expert.ru».

- [ ] **Step 1: Переписать `src/App.test.jsx` на fetch-мок**

Заменить весь файл `src/App.test.jsx`:
```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { formatAnnual } from './utils/usage';

const offers = [
  { id: 1, source: 'major-expert', brand: 'Toyota', model: 'Camry', year: 2020, price: 2000000, mileage: 50000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 2.5, horsepower: 181, url: 'https://example.com/1', image: '' },
  { id: 2, source: 'major-expert', brand: 'Toyota', model: 'Camry', year: 2021, price: 2500000, mileage: 30000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 2.5, horsepower: 181, url: 'https://example.com/2', image: '' },
  { id: 3, source: 'major-expert', brand: 'Toyota', model: 'Camry', year: 2019, price: 1800000, mileage: 70000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 2.5, horsepower: 181, url: 'https://example.com/3', image: '' },
  { id: 4, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2022, price: 5000000, mileage: 20000, bodyType: 'Внедорожник', fuelType: 'Дизель', engineVolume: 3.0, horsepower: 286, url: 'https://example.com/4', image: '' },
  { id: 5, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2021, price: 4500000, mileage: 40000, bodyType: 'Внедорожник', fuelType: 'Дизель', engineVolume: 3.0, horsepower: 286, url: 'https://example.com/5', image: '' },
  { id: 6, source: 'major-expert', brand: 'Lada', model: 'Granta', year: 2023, price: 800000, mileage: 5000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 1.6, horsepower: 98, url: 'https://example.com/6', image: '' },
];

const history = { dates: [], byDate: {} };

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
    json: () => Promise.resolve(url === '/api/offers' ? offers : history),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function getSubtitleCount(n) {
  const subtitle = await screen.findByText(new RegExp(`^${n}\\s`));
  return subtitle;
}

describe('App smoke tests', () => {
  it('renders header with title', async () => {
    render(<App />);
    expect(await screen.findByText('Major Expert Auto Analytics')).toBeInTheDocument();
  });

  it('displays total count of listings', async () => {
    render(<App />);
    await getSubtitleCount(6);
  });

  it('renders all filter controls', async () => {
    render(<App />);
    await screen.findByText('Все марки');
    const selects = screen.getAllByRole('combobox');
    expect(selects).toHaveLength(4);
    expect(screen.getByText('Год от')).toBeInTheDocument();
    expect(screen.getByText('Год до')).toBeInTheDocument();
    expect(screen.getByText('Все типы кузова')).toBeInTheDocument();
    expect(screen.getByText('Только выгодные предложения')).toBeInTheDocument();
  });

  it('does not render chip buttons', async () => {
    render(<App />);
    await screen.findByText('Все марки');
    expect(screen.queryByRole('button', { name: /все типы/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /седан/i })).not.toBeInTheDocument();
  });

  it('filters by brand', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'BMW');
    await getSubtitleCount(2);
  });

  it('filters by body type via selector', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');
    await user.selectOptions(screen.getAllByRole('combobox')[3], 'Внедорожник');
    await getSubtitleCount(2);
  });

  it('filters by year range', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');
    await user.selectOptions(screen.getAllByRole('combobox')[1], '2021');
    await getSubtitleCount(4);
  });

  it('filters by deals only', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');
    await user.click(screen.getByRole('checkbox'));
    await screen.findByText(/объявлений/);
  });

  it('renders stats row', async () => {
    render(<App />);
    await screen.findByText('Объявлений');
    expect(screen.getByText('Средняя цена')).toBeInTheDocument();
    expect(screen.getByText('Средний пробег')).toBeInTheDocument();
    expect(screen.getByText('Выгодных сделок')).toBeInTheDocument();
  });

  it('renders charts section', async () => {
    render(<App />);
    await screen.findByText('Средняя цена по маркам (Топ-10)');
    expect(screen.getByText('Пробег vs Цена')).toBeInTheDocument();
    expect(screen.getByText('Год выпуска vs Средняя цена')).toBeInTheDocument();
    expect(screen.getByText('Топ-10 популярных моделей')).toBeInTheDocument();
  });

  it('renders deals section', async () => {
    render(<App />);
    expect(await screen.findByText(/Лучшие предложения/)).toBeInTheDocument();
  });

  it('renders model tiles', async () => {
    render(<App />);
    expect(await screen.findByText('Toyota Camry')).toBeInTheDocument();
    expect(screen.getAllByText('BMW X5').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Lada Granta').length).toBeGreaterThanOrEqual(1);
  });

  it('resets body type when switching to "all"', async () => {
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все марки');

    const bodySelect = screen.getAllByRole('combobox')[3];
    await user.selectOptions(bodySelect, 'Седан');
    await getSubtitleCount(4);

    await user.selectOptions(bodySelect, 'all');
    await getSubtitleCount(6);
  });
});

describe('Малоездные авто section', () => {
  const cy = new Date().getFullYear();
  const annualOf = (year, mileage) => Math.round(mileage / Math.max(1, cy - year));

  it('renders header with count badge and slider', async () => {
    render(<App />);
    await screen.findByText('Малоездные авто');
    const sliders = screen.getAllByRole('slider');
    expect(sliders[2]).toBeInTheDocument();
    expect(document.querySelector('.count-badge')).toHaveTextContent('6');
  });

  it('sorts cards by annual mileage ascending', async () => {
    render(<App />);
    await screen.findByText('Малоездные авто');
    const cards = document.querySelectorAll('.usage-card');
    expect(cards).toHaveLength(6);
    const first = within(cards[0]);
    expect(first.getByText('Lada Granta')).toBeInTheDocument();
    const grantaBadge = formatAnnual(annualOf(2023, 5000)).replace(/\u00A0/g, ' ');
    expect(first.getByText(grantaBadge)).toBeInTheDocument();
  });

  it('filters cards by slider threshold', async () => {
    render(<App />);
    await screen.findByText('Малоездные авто');
    const slider = screen.getAllByRole('slider')[2];

    fireEvent.change(slider, { target: { value: '5500' } });

    const expectedCount = [
      annualOf(2023, 5000),
      annualOf(2022, 20000),
      annualOf(2021, 30000),
      annualOf(2021, 40000),
      annualOf(2020, 50000),
      annualOf(2019, 70000),
    ].filter(a => a <= 5500).length;
    expect(document.querySelectorAll('.usage-card')).toHaveLength(expectedCount);
    expect(document.querySelectorAll('.usage-card .annual-badge')).toHaveLength(expectedCount);
  });
});
```
> Примечания по тесту:
> - `history = { dates: [], byDate: {} }` — история пуста, `PriceHistoryChart` показывает «Нет данных…» (прежнее поведение).
> - Тайтл «Major Expert Auto Analytics», «Все марки», «Объявлений» и т.д. отображаются до загрузки; fetch-мок резолвится мгновенно, поэтому `findByText` достаточно.
> - В сабтайтле теперь нет «Данные с major-expert.ru»; старые помощники, ищущие это, убраны.

- [ ] **Step 2: Запустить тест — проверить, что падает**

Run: `npx vitest run src/App.test.jsx`
Expected: FAIL — рендер без данных (пустой раздел), т.к. `App` ещё импортирует `cars.json`, а тест его уже не мокает… На самом деле сейчас `cars.json` ещё реально импортируется и в папке есть sample (50 авто) — тест упадёт из-за несоответствия счётчиков (50 вместо 6).

- [ ] **Step 3: Обновить `src/App.jsx` — fetch вместо импорта**

Изменения:
1. Удалить строку `import rawData from '../data/cars.json';`.
2. В блок `useState` добавить `const [rawCars, setRawCars] = useState(null);`.
3. Заменить весь `useEffect`, который сейчас грузит историю через `import.meta.glob`, на:
```jsx
  useEffect(() => {
    async function loadData() {
      try {
        const [offersRes, historyRes] = await Promise.all([
          fetch('/api/offers'),
          fetch('/api/history'),
        ]);
        const nextOffers = await offersRes.json();
        const history = await historyRes.json();
        setRawCars(nextOffers);

        const dates = history?.dates || [];
        const byDate = history?.byDate || {};
        const data = new Map(dates.map(d => [d, byDate[d] || []]));
        setHistoryDates(dates);
        setHistoryData(data);
      } catch (e) {
        console.warn('API недоступен:', e);
        setRawCars([]);
      }
    }
    loadData();
  }, []);
```
4. Заменить `const cars = useMemo(() => calculateScore(rawData), []);` на:
```jsx
  const cars = useMemo(() => calculateScore(rawCars || []), [rawCars]);
```
5. Заменить сабтайтл:
```jsx
        <p className="subtitle">
          {rawCars === null ? 'Загрузка данных…' : `${segmentedCars.length} объявлений`}
        </p>
```
6. Остальное не трогаем (`PriceHistoryChart` получает `historyDates`/`historyData` как раньше).

- [ ] **Step 4: Запустить App-тест — проверить, что проходит**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS.

- [ ] **Step 5: Обновить `src/App.scatter.test.jsx`**

Заменить шапку (мок `cars.json` → стаб fetch):
```jsx
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';

// ResponsiveContainer в jsdom имеет нулевой размер и не рендерит чарт.
// Подменяем его на контейнер фиксированной ширины, чтобы легенда и точки оказались в DOM.
vi.mock('recharts', async () => {
  const actual = await vi.importActual('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children, height }) =>
      React.cloneElement(children, { width: 600, height: height || 300 }),
  };
});

const scatterOffers = [
  { id: 1, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2021, mileage: 30000, price: 5000000, bodyType: 'Внедорожник', isNew: false },
  { id: 2, source: 'major-expert', brand: 'Audi', model: 'Q7', year: 2020, mileage: 50000, price: 4000000, bodyType: 'Внедорожник', isNew: false },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
    json: () => Promise.resolve(url === '/api/offers' ? scatterOffers : { dates: [], byDate: {} }),
  })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const { default: App } = await import('./App');

const legend = () => [...document.querySelectorAll('.recharts-legend-item')].map(n => n.textContent);
const points = () => document.querySelectorAll('.recharts-scatter-symbol').length;

describe('Скаттер: переключение марок через легенду', () => {
  it('скрытая марка остаётся в легенде и её можно вернуть', async () => {
    render(<App />);
    await screen.findByText('BMW');
    expect(legend().sort()).toEqual(['Audi', 'BMW']);
    const before = points();

    const bmw = [...document.querySelectorAll('.recharts-legend-item')].find(n => n.textContent === 'BMW');
    fireEvent.click(bmw);

    expect(points()).toBeLessThan(before);
    expect(legend().sort()).toEqual(['Audi', 'BMW']);

    const bmwAgain = [...document.querySelectorAll('.recharts-legend-item')].find(n => n.textContent === 'BMW');
    expect(bmwAgain).toBeTruthy();
    fireEvent.click(bmwAgain);
    expect(points()).toBe(before);
  });
});
```

- [ ] **Step 6: Полный прогон тестов**

Run: `npm test`
Expected: все PASS.

- [ ] **Step 7: Проверка сборки**

Run: `npm run build`
Expected: `dist/` собирается без ошибок (cars.json больше не в бандле).

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/App.test.jsx src/App.scatter.test.jsx
git commit -m "feat: dashboard loads offers and history from API instead of bundled JSON"
```

---

### Task 7: Прокси `/api` в dev

**Files:**
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: эндпоинты Task 5.
- Produces: dev-сервер проксирует `/api` на `http://127.0.0.1:3001`.

- [ ] **Step 1: Добавить прокси в `vite.config.js`**

Заменить блок `server` на:
```js
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
```

- [ ] **Step 2: Проверить, что тесты и сборка не сломались**

Run: `npm test && npm run build`
Expected: PASS и чистая сборка.

- [ ] **Step 3: Commit**

```bash
git add vite.config.js
git commit -m "feat: proxy /api to API server in dev"
```

---

### Task 8: Cron-парсинг (GitHub Actions) + подготовка сервера

**Files:**
- Create: `.github/workflows/scrape-daily.yml`
- Modify: `.github/workflows/deploy.yml`
- Create: `ops/SERVER_SETUP.md`, `ops/auto-analytics-api.service`, `ops/nginx-api.conf`

**Interfaces:**
- Consumes: `npm run migrate` (AUTO_MIGRATE), `npm run scrape`/`scraper/index.js` (DATABASE_URL), `npm run server` (systemd).
- Produces: ежедневный парсинг по cron (~03:00 МСК); деплой не парсит.

- [ ] **Step 1: Новый воркфлоу `.github/workflows/scrape-daily.yml`**

```yaml
name: Daily Scrape

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - name: Scrape and sync DB on server
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          password: ${{ secrets.DEPLOY_PASSWORD }}
          env: |
            DATABASE_URL=${{ secrets.DATABASE_URL }}
          script: |
            cd /var/www/auto-analytics/app
            git pull origin master
            npm install
            AUTO_MIGRATE=1 node scraper/migrate.js
            node scraper/index.js
```
> `cron: '0 0 * * *'` = 00:00 UTC = 03:00 МСК. Секрет `DATABASE_URL` добавить в репозиторий (Settings → Secrets): строка вида `postgres://auto:PASS@127.0.0.1:5432/auto_analytics`.
> Если сервер использует `.env` файл — вместо `env:` передать `source /etc/auto-analytics.env` внутри `script:` (см. `ops/SERVER_SETUP.md`). Один из двух способов обязателен.

- [ ] **Step 2: Убрать парсинг из `deploy.yml`**

В `.github/workflows/deploy.yml` в `script:` удалить строку `node scraper/index.js`. Итоговый script:
```yaml
          script: |
            cd /var/www/auto-analytics/app
            git pull origin master
            npm install
            npm run build
            systemctl reload nginx
```

- [ ] **Step 3: systemd unit `ops/auto-analytics-api.service`**

```ini
[Unit]
Description=Auto-Analytics API (Express + PostgreSQL)
After=network.target postgresql.service

[Service]
WorkingDirectory=/var/www/auto-analytics/app
ExecStart=/usr/bin/node server/index.js
EnvironmentFile=/etc/auto-analytics.env
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```
> `/etc/auto-analytics.env`: `DATABASE_URL=postgres://auto:…@127.0.0.1:5432/auto_analytics` и `PORT=3001`.

- [ ] **Step 4: Пример nginx-прокси `ops/nginx-api.conf`**

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```
> Вставить этот `location` внутрь `server { }` для домена в конфиге nginx на сервере, либо объединить с основным сайтом через тюнинг. Это пример для установки.

- [ ] **Step 5: Инструкция `ops/SERVER_SETUP.md`**

```markdown
# Установка PostgreSQL, API-сервиса и cron на сервере (90.156.129.73)

## 1. PostgreSQL (системный пакет, не Docker)

    sudo apt update
    sudo apt install -y postgresql
    sudo -u postgres psql -c "CREATE USER auto WITH PASSWORD 'СМЕНИ_ПАРОЛЬ';"
    sudo -u postgres psql -c "CREATE DATABASE auto_analytics OWNER auto;"

## 2. Переменные окружения для сервисов

Создать `/etc/auto-analytics.env` (владелец root, chmod 600):

    DATABASE_URL=postgres://auto:СМЕНИ_ПАРОЛЬ@127.0.0.1:5432/auto_analytics
    PORT=3001

## 3. systemd-сервис API

    sudo cp ops/auto-analytics-api.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable --now auto-analytics-api
    curl http://127.0.0.1:3001/api/health   # -> {"ok":true}

## 4. nginx: прокси /api на Express

В server-блок сайта добавить `location /api/ { … }` из `ops/nginx-api.conf`,
затем:

    sudo nginx -t && sudo systemctl reload nginx

## 5. Первый парсинг (без ожидания cron)

    cd /var/www/auto-analytics/app
    git pull origin master
    npm install
    AUTO_MIGRATE=1 node scraper/migrate.js
    node scraper/index.js

## 6. Cron

GitHub Actions воркфлоу `.github/workflows/scrape-daily.yml` каждый день
в 00:00 UTC (03:00 МСК) подтягивает код, прогоняет миграцию и парсер.
Секрет `DATABASE_URL` (или `DEPLOY_PASSWORD`) должен быть задан в репозитории.
```

- [ ] **Step 6: Проверить валидность YAML**

Run: `python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in ['.github/workflows/scrape-daily.yml','.github/workflows/deploy.yml']]; print('YAML OK')"`
Expected: `YAML OK`. Если pyyaml не установлен — проверить индентацию вручную.

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/scrape-daily.yml .github/workflows/deploy.yml ops/SERVER_SETUP.md ops/auto-analytics-api.service ops/nginx-api.conf
git commit -m "feat: daily cron scrape workflow, API systemd unit and server setup docs"
```

---

### Task 9: Локальная интеграционная проверка всего стека

**Files:** — (только проверки, без кода)

- [ ] **Step 1: Создать локальную БД и схему**

Run:
```bash
createdb auto_analytics 2>/dev/null || true
DATABASE_URL=postgres://postgres:postgres@localhost:5432/auto_analytics AUTO_MIGRATE=1 node scraper/migrate.js
```
Expected: `Схема PostgreSQL готова`.

- [ ] **Step 2: Собрать свежие данные (быстрый прогон)**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5432/auto_analytics node scraper/index.js --pages=2`
Expected: `DB sync: … new, … updated, … deactivated` (≈24 объявления).

- [ ] **Step 3: Проверить API**

Run:
```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/auto_analytics node server/index.js &
sleep 1
curl -s http://127.0.0.1:3001/api/health
curl -s http://127.0.0.1:3001/api/meta
curl -s "http://127.0.0.1:3001/api/offers" | python3 -m json.tool | head -20
curl -s "http://127.0.0.1:3001/api/history" | python3 -m json.tool | head -20
kill %1
```
Expected: health `{"ok":true}`, meta со списками, offers — массив с `source: "major-expert"` и camelCase-полями, history — `{ dates: [...], byDate: {...} }`.

- [ ] **Step 4: Сборка и тесты**

Run: `npm run build && npm test`
Expected: чистая сборка, все PASS.

- [ ] **Step 5: Проверить, что данных нет в бандле**

Run: `grep -c "S-Класс" dist/assets/*.js || echo "0 — данных в бандле нет"`
Expected: `0`.

- [ ] **Step 6: Git-статус чистый**

Run: `git status --short`
Expected: пусто (после всех коммитов) или только ожидаемые незакоммиченные файлы.

---

### Task 10: Обновить документацию

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`

- [ ] **Step 1: Обновить `AGENTS.md`**

- В `## Commands` добавить:
```text
npm run migrate   # Создать схему PostgreSQL (требует DATABASE_URL)
npm run server    # Запустить Express API на :3001 (требует DATABASE_URL)
```
- В `## Data Source` отметить: парсинг пишет в PostgreSQL; `data/keyboard.lock`-история `data/history/*.json` больше не используется дашбордом (история из `/api/history`).
- В `## Gotchas` добавить:
```text
- DATABASE_URL (postgres://…) обязателен для записи в БД и запуска API
- Cron ежедневно 03:00 МСК: .github/workflows/scrape-daily.yml
- Дашборд читает /api/offers, /api/history, /api/meta (nginx проксирует /api на :3001)
```

- [ ] **Step 2: Обновить `README.md`**

- В «Что внутри»: заменить пункт про парсер — «складывает предложения в PostgreSQL и каждый день обновляет их по cron»; упомянуть API.
- В «Быстрый старт»: после `npm run dev` добавить, что для данных нужен запущенный API + БД (см. `ops/SERVER_SETUP.md`).

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md README.md
git commit -m "docs: document PostgreSQL, daily scrape workflow and API"
```

---

### Task 11: Финальная проверка

**Files:** —

- [ ] **Step 1: Полный тестовый прогон**

Run: `npm test`
Expected: все PASS, интеграционные блоки — PASS (с локальной БД) или SKIP.

- [ ] **Step 2: Сборка**

Run: `npm run build`
Expected: чистая сборка.

- [ ] **Step 3: Бандл без данных**

Run: `grep -c "S-Класс" dist/assets/*.js || echo "0 — данных в бандле нет"`
Expected: `0`.

- [ ] **Step 4: Git-статус**

Run: `git status --short`
Expected: чистый репозиторий.

- [ ] **Step 5: Итог**

Проверить, что выполнены все задачи T1 из спецификации: БД + ежедневный cron + API + дашборд из API. T2 (rolf.ru) и T3 (количество предложений на графике года, владельцы в карточках) — отдельные планы после сдачи T1.
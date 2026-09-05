# Rolf: второй источник + сравнение по источникам — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить rolf.ru (все б/у Москвы) вторым источником в БД/API/дашборд, фильтр источника и секцию «Сравнение источников» по строгому ключу марка+модель+год+объём.

**Architecture:** Парсер `scraper/rolf.js` по образцу `scraper/index.js` пишет через уже существующий `scraper/db.js` (`applySync` c `source:'rolf'`), без изменений схемы. Чтение: `/api/offers?limit=`, `/api/history?days=`; дашборд фильтрует источник на клиенте, матчинг — чистый утилит `src/utils/matchCars.js`, секцию рендерит новый `src/components/SourceComparison.jsx`.

**Tech Stack:** Node 22 ESM, axios, pg, Express 5, React 19, Recharts, Vitest, cheerio (запасной путь спайка).

**Spec:** `docs/superpowers/specs/2026-09-05-rolf-source-and-comparison-design.md` (план аргументирует от спеки).

## Global Constraints

- Схема БД не меняется: `offers.source='rolf'`, `UNIQUE(source, source_id)`.
- Матчинг «того же авто» — строго `норм(brand)+норм(model)+year+engineVolume`; рыхлый/толерантный матчинг вне скоупа.
- Только б/у («с пробегом»), город Москва (`city_id=1`). `is_new=false` всегда.
- Окно `/api/history` и ретеншн `price_history` — 90 дней.
- Парсер: задержка 300мс, таймаут 15с, браузерный UA, retry 1 попытка/страница, частичный прогон не деактивирует (паттерн T1, коммит `56487cf`).
- Каждый источник деактивирует только своих: в `applySync` флаг `deactivate` уже per-source.
- Тесты: `npm test` (vitest run). Юнит — node-окружение, UI — jsdom. Gated-интеграция только при `DATABASE_URL`.
- No real secrets: endpoint-контракт и фикстуры — только публичные данные.

---

### Task 1: Спайк — точный endpoint/формат данных rolf.ru

Спайк определяет транспорт: JSON-API `apiweb.rolf.ru` (приоритет) или парсинг SSR-страницы через cheerio (фолбэк). Выход спайка — контракт, на который опираются Task 2 и Task 5.

**Files:**
- Create: `test/fixtures/rolf-vehicles-page-1.json` (реальный ответ листинга, если JSON-режим)
- Create: `test/fixtures/rolf-listing-ssr.html` (создать, если фолбэк-режим подтверждён)
- Create: `docs/superpowers/rolf-endpoint.md` (контракт веб-источника)
- Modify: `docs/superpowers/specs/2026-09-05-rolf-source-and-comparison-design.md` — не трогать; обновить нельзя вне скоупа

**Interfaces:**
- Produces: файл `docs/superpowers/rolf-endpoint.md` с полями: mode (`json` | `cheerio`), method, URL (полный с параметрами), заголовки, параметры пагинации, поле `total`/`lastPage`, маппинг полей item → колонки `offers`, `per_page`, формат `engineCapacity` (литры или см³), формат `model`, пример `brand`, id-поле объявления, url объявления, теги/селекторы карточек (только для cheerio). Фикстура `test/fixtures/*` с реальными данными первой страницы.

- [ ] **Step 1: Подготовить каталог фикстур**

```bash
mkdir -p test/fixtures
```

- [ ] **Step 2: Закрепить факты признания API (фиксация текущего знания)**

Проверить, что следующие факты верны на сегодня (каждый командой curl, UA браузерный, таймаут 20с):
- `https://apiweb.rolf.ru/api/v2/cities` → HTTP 200 JSON (города; найти `id` для Москвы, ожидается 1).
- `https://apiweb.rolf.ru/api/v2/vehicles` с вариантами параметров до ближайшего 200. Стартсет параметров по ключу кеша SPA `per_page=24-city_id=1-vehicle_type=used-type=car`:
  `curl -s 'https://apiweb.rolf.ru/api/v2/vehicles?per_page=24&city_id=1&vehicle_type=used&type=car&page=1'`
  Если 404/422 — перебрать паттерны: `/api/v2/vehicles/used`, `/api/v2/cars/used`, `/api/v2/stock`, `&city=msk`, `&filters[]=...`, POST-форма. Максимум 12 попыток; каждая фиксируется в отчёт.
- Если ни один вариант не дал 200 JSON со списком машин — перейти на фолбэк-режим (cheerio, шаг 5).

Expected: зафиксирован точный запрос первого успешного прогона или решение о фолбэке.

- [ ] **Step 3: Сохранить фикстуру JSON-режима**

Если найден 200-ответ со списком машин:
```bash
curl -s -A 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' \
  '<URL из шага 2 с page=1&per_page=24>' -o test/fixtures/rolf-vehicles-page-1.json
```
Проверить размер > 0 и что в JSON есть массив машин. Записать в контракт `mode: json`, полный URL, параметры, имена полей элемента списка (запустить `node` и вывести `Object.keys(item[0])`).

Expected: `test/fixtures/rolf-vehicles-page-1.json` размером >0.5KБ.

- [ ] **Step 4: Определить пагинацию и объём**

Из первого ответа вытащить: `per_page`, `total`, `last_page` (или аналог — пути `data.meta`, `data.pagination`, поля `total`). Записать в контракт ключи. Посчитать страницы Москвы. НЕ качать все страницы.

Expected: в контракте заполнены `total`, `lastPage`, ключ пагинации.

- [ ] **Step 5: (фолбэк) Парсинг SSR-страницы через cheerio**

Только если шаг 2 не дал JSON: сохранить `/tmp/rolf_used.html` (уже есть; перекачать свежую):
```bash
curl -s -A '<UA>' 'https://www.rolf.ru/cars/used/' -o test/fixtures/rolf-listing-ssr.html
```
`node -e` скриптом с cheerio: найти карточки (перебирать селекторы `.vehicle-card`, `[data-testid]`, `a[href*="/cars/used/"]`), на первую карточку вывести её текст (марка/модель/цена/пробег/год) — подтвердить наличие пре-рендеренных карточек. Если карточек нет — зафиксировать в контракте `mode: cheerio`, `render: false` и добавить примечание, что потребуется разбор `window.__NUXT__` (devalue) — в Task 2 тогда реализуется разбор этого конкретного формата по образцу из контракта. Записать в контракт выбранный селектор карточек и их DOM-структуру (поля карточки: цена, пробег, год, название).

Expected: фолбэк-путь описан в контракте с конкретным селектором или решением про `__NUXT__`.

- [ ] **Step 6: Полевые колонки и нормализация**

Из фикстуры (JSON: первый элемент; cheerio: разобранная карточка) составить маппинг → `offers` для каждого поля: `id` (источник url/id), `brand`, `model`, `name`, `year` (`year`/`modelYear`), `mileage`, `body_type` (`bodyId`→имя? или `body`), `fuel_type` (`engineType`), `engine_volume` (формат: если значение > 10 — это см³, делить на 1000 и округлять до 0.1; если < 10 — уже литры), `horsepower` (`enginePower`), `transmission`, `drive_type`, `color` (цвет из `colors` или отдельного поля), `owners` (`ownersNumber`), `price`, `old_price` (`priceOld`/`priceDiscount`), `url`, `image`. Каждое найденное поле — в контракт с точным именем; отсутствующее — пометить null.

Также выписать 5–10 реальных значений `model` и `brand` для калибровки словаря алиасов Task 5 (записать в контракт секцией «Словарь»).

Expected: в контракте заполнен маппинг колонок и реальные образцы brand/model.

- [ ] **Step 7: Отчёт и коммит**

Записать отчёт спайка в `.superpowers/sdd/<дата>-rolf/comparison/…` (в каталог лжеджера плана; см. репорт-файл ниже). Проверить, что контракт не содержит секретов. Коммит:

```bash
git add test/fixtures docs/superpowers/rolf-endpoint.md
git commit -m "feat: spike rolf source — endpoint contract and fixtures"
```

Expected: коммит со спайк-артефактами без мусора.

- [ ] **Step 8: Репорт в лжеджер**

Создать отчёт: `.superpowers/sdd/2026-09-05-rolf-source/comparison/task-1-spike-report.md` — итог спайка, что нашлось за шаги 2–5, выбранный mode, счётчики Москвы, ссылка на контракт.

---

### Task 2: Общая библиотека + парсер `scraper/rolf.js` (write-сторона)

Выносит общие хелперы в `scraper/lib.js`, рефакторит `scraper/index.js` на импорт из неё и реализует `scraper/rolf.js` по контракту Task 1.

**Files:**
- Create: `scraper/lib.js`
- Create: `scraper/rolf.js`
- Create: `test/rolf.test.js`
- Modify: `scraper/index.js` — импортировать `delay`, `HEADERS`, `ensureDirs`, `deduplicate` из `lib.js` и удалить локальные определения (строки 12-16, 18-20, 22-25, 125-132 как в текущей версии)
- Modify: `test/rolf.test.js` — юниты normalize + fetchPage (мок axios)
- Test: `test/fixtures/rolf-vehicles-page-1.json` (из Task 1)

**Interfaces:**
- Consumes: `docs/superpowers/rolf-endpoint.md` (mode, URL, параметры, маппинг колонок, поля пагинации), фикстура из Task 1.
- Produces:
  - `scraper/lib.js`: `export const HEADERS`, `export function delay(ms)`, `export function ensureDirs()`, `export function deduplicate(cars)`.
  - `scraper/rolf.js`: `export function normalizeRolfItem(item) → car` (формат offers, `source` не входит), `export async function fetchPage(page) → {cars, total, lastPage, ok}`, `scrapeAll(maxPages)` — основной CLI.
  - `test/rolf.test.js` — `describe('normalizeRolfItem')`, `describe('fetchPage')`.

- [ ] **Step 1: Написать падающий тест на lib-хелперы**

`test/rolf.test.js` (в арбитраже с Task 3+ не конфликтует):

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { delay, deduplicate } from '../scraper/lib.js';

describe('lib', () => {
  it('deduplicate убирает дубли по id', () => {
    const cars = [{ id: 1 }, { id: 2 }, { id: 1 }];
    expect(deduplicate(cars)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('delay ждёт ms', async () => {
    const t0 = Date.now();
    await delay(15);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(10);
  });
});
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Run: `npx vitest run test/rolf.test.js`
Expected: FAIL — `Cannot find module '../scraper/lib.js'`.

- [ ] **Step 3: Создать `scraper/lib.js` с хелперами**

```js
import fs from 'fs';
import path from 'path';

export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Content-Type': 'application/json',
};

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function ensureDirs() {
  const DATA_DIR = path.join(process.cwd(), 'data');
  const HISTORY_DIR = path.join(DATA_DIR, 'history');
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
  return { DATA_DIR, HISTORY_DIR };
}

export function deduplicate(cars) {
  const seen = new Set();
  return cars.filter(car => {
    if (seen.has(car.id)) return false;
    seen.add(car.id);
    return true;
  });
}
```

- [ ] **Step 4: Запустить тест, убедиться что зелёный**

Run: `npx vitest run test/rolf.test.js`
Expected: PASS (2 теста lib).

- [ ] **Step 5: Рефакторинг `scraper/index.js` на импорт из `lib.js`**

Заменить в `scraper/index.js`:
- строки объявлений `const HEADERS = {...}` (12-16) на `import { HEADERS, delay, ensureDirs, deduplicate } from './lib.js';`
- удалить локальные `function delay` (18-20), `function ensureDirs` (22-25), `function deduplicate` (125-132).
- вызовы `ensureDirs()` внутри `scrapeAll` остаются (функция теперь из lib, возвращает объект — вызов без использования return'а сохраняет поведение).
- удалить неиспользуемые импорты, если появились (fs/path остаются нужными для записи кэша).

- [ ] **Step 6: Прогнать весь стек тестов и сборку**

Run: `npm test && npm run build`
Expected: все тесты зелёные (77+), сборка успешна, `grep -c "S-Класс" dist/assets/*.js` = 0.

- [ ] **Step 7: Коммит lib + рефакторинг**

```bash
git add scraper/lib.js scraper/index.js test/rolf.test.js
git commit -m "refactor: extract shared scraper helpers to lib.js"
```

- [ ] **Step 8: Написать падающий тест на normalizeRolfItem**

По контракту `docs/superpowers/rolf-endpoint.md` (mode `json` из Task 1). Пример с маппингом «year/modelYear, engineCapacity см³»:

```js
import fs from 'fs';
import { normalizeRolfItem } from '../scraper/rolf.js';

const fixture = JSON.parse(fs.readFileSync(
  new URL('./fixtures/rolf-vehicles-page-1.json', import.meta.url), 'utf8'
));
const item = fixture.items?.[0] ?? fixture.data?.[0] ?? Object.values(fixture)[0]?.[0];

describe('normalizeRolfItem', () => {
  it('маппит item в формат offers (source rolf)', () => {
    const car = normalizeRolfItem(item);
    expect(car.id).toBeDefined();
    expect(car.brand).toBeTruthy();
    expect(car.model).toBeTruthy();
    expect(car.year).toBe(item.year ?? item.modelYear);
    expect(car.mileage).toBe(item.mileage);
    expect(car.price).toBe(item.price);
    expect(car.horsepower).toBe(item.enginePower ?? null);
    expect(car.isNew).toBe(false);
  });

  it('engineCapacity в см³ переводит в литры', () => {
    const car = normalizeRolfItem({ ...item, engineCapacity: 2493, year: 2020, price: 100 });
    expect(car.engineVolume).toBe(2.5);
  });
});
```

Примечание: если контракт дал другой маппинг (fuel от `engineType`→`fuel_type`, `transmission` буквенное, цвет в `colors`), тест в испытании пишется по контракту, а не по этому шаблону — поля обязательные для проверки: `id, brand, model, year, mileage, price, engineVolume, isNew`.

- [ ] **Step 9: Запустить, убедиться что падает**

Run: `npx vitest run test/rolf.test.js`
Expected: FAIL — `Cannot find module '../scraper/rolf.js'`.

- [ ] **Step 10: Реализовать `scraper/rolf.js` (JSON-режим по контракту)**

Каркас (подставьте URL/параметры/поля из контракта):

```js
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { HEADERS, delay, ensureDirs, deduplicate } from './lib.js';
import { createPool, initSchema, applySync } from './db.js';

const API_URL = process.env.ROLF_API_URL || 'https://apiweb.rolf.ru/api/v2/vehicles';
const CITY_ID = Number(process.env.ROLF_CITY_ID || 1);
const PER_PAGE = 24;
const DELAY_MS = 300;

export function normalizeRolfItem(item) {
  const id = item.id ?? item.ownerId ?? item.vehicleId;
  const rawVolume = item.engineCapacity;
  const engineVolume = rawVolume == null ? null
    : (Number(rawVolume) > 10 ? Math.round((Number(rawVolume) / 1000) * 10) / 10 : Math.round(Number(rawVolume) * 10) / 10);
  return {
    id,
    brand: item.brand ?? null,
    model: item.model ?? item.complectation ?? null,
    name: item.name ?? item.complectation ?? null,
    year: item.year ?? item.modelYear ?? null,
    mileage: item.mileage ?? null,
    bodyType: item.body ?? item.bodyType ?? null,
    fuelType: item.engineType ?? null,
    engineVolume,
    horsepower: item.enginePower ?? null,
    transmission: item.transmission ?? null,
    driveType: item.driveType ?? null,
    color: item.color ?? (item.colors?.[0] ?? null),
    owners: item.ownersNumber ?? null,
    price: item.price ?? null,
    oldPrice: item.priceOld ?? null,
    url: item.url ? `https://www.rolf.ru${item.url}` : null,
    image: item.image ?? item.picture ?? (item.images?.[0] ?? null),
    isNew: false,
  };
}

export async function fetchPage(page) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.get(API_URL, {
        params: { per_page: PER_PAGE, city_id: CITY_ID, vehicle_type: 'used', type: 'car', page },
        headers: HEADERS,
        timeout: 15000,
      });
      const data = response.data;
      const items = data.items ?? data.data ?? data.vehicles ?? [];
      return { cars: items.map(normalizeRolfItem), total: data.total ?? 0, lastPage: data.last_page ?? data.lastPage ?? 0, ok: true };
    } catch (error) {
      if (attempt === 1) {
        console.log(`  Error on page ${page} (${error.message}). Retrying...`);
        await delay(DELAY_MS * 2);
      } else {
        console.log(`  Error on page ${page} (${error.message}). Giving up.`);
        return { cars: [], total: 0, lastPage: 0, ok: false };
      }
    }
  }
}
```

ВАЖНО: если контракт зафиксировал `mode: cheerio`, вместо axios-ветки `fetchPage` реализуется разбор `test/fixtures/rolf-listing-ssr.html` через `cheerio` по селекторам из контракта (тогда этот файл читает фикстуру, извлекает карточки и отдаёт тот же `{cars, total, lastPage, ok}`). Выбор ветки — строго по контракту Task 1.

- [ ] **Step 11: Реализовать `scrapeAll` (паттерн T1: retry/ok/деактивация)**

```js
export async function scrapeAll(maxPages = Infinity) {
  ensureDirs();

  console.log('Fetching page 1 to get total...');
  const first = await fetchPage(1);
  if (first.cars.length === 0) {
    console.log('Failed to fetch page 1. Aborting.');
    return [];
  }

  const totalPages = Math.min(first.lastPage, maxPages);
  let allCars = [...first.cars];
  let failedPages = 0;
  console.log(`Total: ${first.total} cars across ${first.lastPage} pages. Scraping ${totalPages} pages...\n`);

  for (let page = 2; page <= totalPages; page++) {
    await delay(DELAY_MS);
    const res = await fetchPage(page);
    if (!res.ok) failedPages++;
    console.log(`  Page ${page}/${totalPages}: ${res.cars.length} cars${res.ok ? '' : ' (FAILED)'}`);
    allCars = allCars.concat(res.cars);
  }

  const uniqueCars = deduplicate(allCars);

  const { DATA_DIR } = ensureDirs();
  const mainPath = path.join(DATA_DIR, 'cars-rolf.json');
  fs.writeFileSync(mainPath, JSON.stringify(uniqueCars, null, 2));

  if (process.env.DATABASE_URL) {
    const pool = createPool(process.env.DATABASE_URL);
    try {
      await initSchema(pool);
      const partial = failedPages > 0;
      if (partial) {
        console.warn(`  WARNING: ${failedPages} page(s) failed — partial data, deactivation skipped`);
      }
      const result = await applySync(pool, { source: 'rolf', cars: uniqueCars, today: new Date().toISOString().split('T')[0], deactivate: !partial });
      console.log(`DB sync: ${result.inserted} new, ${result.updated} updated, ${result.deactivated} deactivated`);
    } finally {
      await pool.end();
    }
  } else {
    console.log('DATABASE_URL не задан — сохранён только кэш cars-rolf.json');
  }

  console.log(`\nDone! Scraped ${uniqueCars.length} unique cars.`);

  return uniqueCars;
}

const args = process.argv.slice(2);
const pagesArg = args.find(a => a.startsWith('--pages='));
scrapeAll(pagesArg ? parseInt(pagesArg.split('=')[1]) : Infinity).catch(console.error);
```

- [ ] **Step 12: Добавить тест на fetchPage (мок axios)**

```js
import { vi } from 'vitest';
vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));
import axios from 'axios';
import { fetchPage } from '../scraper/rolf.js';

describe('fetchPage', () => {
  it('успех возвращает ok:true и cars', async () => {
    axios.get.mockResolvedValue({ data: { items: [{ id: 1, brand: 'BMW', model: 'X5', price: 100 }] } });
    const res = await fetchPage(1);
    expect(res.ok).toBe(true);
    expect(res.cars[0].id).toBe(1);
  });

  it('после двух ошибок возвращает ok:false', async () => {
    axios.get.mockRejectedValue(new Error('net'));
    const res = await fetchPage(1);
    expect(res.ok).toBe(false);
    expect(res.cars).toEqual([]);
  });
});
```

Примечание: в этом шаблоне `findMatches`-сценарий не нужен — тестируем только `fetchPage`; `normalizeRolfItem` уже покрыт выше. При cheerio-режиме `fetchPage` вместо axios-мока тестируется на фикстуре `rolf-listing-ssr.html`.

- [ ] **Step 13: Прогнать тесты rolf + весь стек**

Run: `npx vitest run test/rolf.test.js && npm test && npm run build`
Expected: PASS всё; сборка чистая.

- [ ] **Step 14: Smoke-запуск против тестовой БД**

Run (тестовая БД на сервере через туннель 5433, URL-encoded пароль):
```bash
DATABASE_URL='postgres://root:o%2CL072Za%23%23@127.0.0.1:5433/auto_analytics_test' node scraper/rolf.js --pages=2
```
Expected: `DB sync: N new, 0 updated, 0 deactivated`, без WARNING. Если туннель закрыт — поднять командой из `ops/SERVER_SETUP.md`.

- [ ] **Step 15: Коммит**

```bash
git add scraper/rolf.js test/rolf.test.js
git commit -m "feat: add rolf.ru scrape source"
```

---

### Task 3: `?limit` для `/api/offers` и `?days` для `/api/history`

**Files:**
- Modify: `server/app.js` (routes `/api/offers`, `/api/history`)
- Modify: `scraper/db.js` — `getOffers` (фильтр `limit`), `getHistory` (фильтр `days`, дефолт 90)
- Test: `test/api.test.js`, `test/db.test.js`

**Interfaces:**
- Consumes: `db.getOffers(filters)` с существующим `buildOfferQuery`, `db.getHistory({source})`.
- Produces: `buildOfferQuery` получает поддержку `filters.limit` необязательно (реализовать через sql-составление в `getOffers`); `getHistory(pool, {source, days=90})`; `/api/offers?limit=N`, `/api/history?days=N`.

- [ ] **Step 1: Падающие юнит-тесты**

`test/api.test.js` — добавить в `makeDb` spy-совместимые функции:

```js
it('GET /api/offers передаёт limit в getOffers', async () => {
  const getOffers = vi.fn().mockResolvedValue([]);
  await request(createApp(makeDb({ getOffers }))).get('/api/offers?source=rolf&limit=25');
  expect(getOffers).toHaveBeenCalledWith(expect.objectContaining({ source: 'rolf', limit: '25' }));
});

it('GET /api/history передаёт days в getHistory', async () => {
  const getHistory = vi.fn().mockResolvedValue({ dates: [], byDate: {} });
  await request(createApp(makeDb({ getHistory }))).get('/api/history?days=30&source=rolf');
  expect(getHistory).toHaveBeenCalledWith(expect.objectContaining({ source: 'rolf', days: '30' }));
});
```

`test/db.test.js` — юнит (не gated) на SQL:

```js
describe('buildOfferQuery limit', () => {
  it('limit добавляет LIMIT только при валидном положительном числе', () => {
    const { sql, params } = buildOfferQuery({ source: 'rolf', limit: '10' });
    expect(sql).toContain('LIMIT 10');
    expect(buildOfferQuery({ source: 'rolf', limit: 'abc' }).sql).not.toContain('LIMIT');
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `npx vitest run test/api.test.js test/db.test.js`
Expected: FAIL (сигнатуры не передаются/`buildOfferQuery` не возвращает `sql`).

- [ ] **Step 3: Реализовать limit в db.js**

В `scraper/db.js` изменить `buildOfferQuery` так, чтобы он возвращал `{ where, params, sql }`, где `sql = \`SELECT * FROM offers WHERE ${where} ORDER BY id${limitSql}\``, а `limitSql` — добавленное `LIMIT n` при валидном `Number.isInteger` положительном числе. `getOffers`:

```js
export async function getOffers(pool, filters = {}) {
  const { sql, params } = buildOfferQuery(filters);
  const { rows } = await pool.query(sql, params);
  return rows;
}
```

- [ ] **Step 4: Реализовать days в db.js**

```js
export async function getHistory(pool, { source, days = 90 } = {}) {
  const params = [];
  let where = 'WHERE h.date >= CURRENT_DATE - $1';
  params.push(Number.isInteger(+days) && +days > 0 ? +days : 90);
  if (source) {
    params.push(source);
    where += ` AND o.source = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT to_char(h.date, 'YYYY-MM-DD') AS date, o.brand, o.model, h.price
     FROM price_history h JOIN offers o ON o.id = h.offer_id
     ${where} ORDER BY h.date`,
    params,
  );
  return rows;
}
```

- [ ] **Step 5: app.js — пробросить limit и days**

`/api/offers`: добавить `limit: req.query.limit || undefined` в `filters`.
`/api/history`:
```js
const rows = await db.getHistory({ source: req.query.source || undefined, days: req.query.days || undefined });
```

- [ ] **Step 6: Прогнать тесты и сборку**

Run: `npm test && npm run build`
Expected: PASS; старые тесты (без limit/days) не сломаны (дефолты 90 дней не влияют на фикстуры с датами сегодня).

- [ ] **Step 7: Коммит**

```bash
git add server/app.js scraper/db.js test/api.test.js test/db.test.js
git commit -m "feat: support limit on /api/offers and days window on /api/history"
```

---

### Task 4: Cron rolf.ru + ретеншн history

**Files:**
- Create: `scraper/cleanup.js`
- Modify: `.github/workflows/scrape-daily.yml`
- Modify: `package.json` (скрипты `scrape:rolf`, `scrape:rolf:quick`, `prune:history`)
- Test: `test/scraper.test.js`

**Interfaces:**
- Consumes: `createPool` из `db.js`.
- Produces: `export async function runCleanup(pool, days = 90) → number` (количество удалённых строк); CLI-запуск `node scraper/cleanup.js`.

- [ ] **Step 1: Падающий тест runCleanup**

`test/scraper.test.js`:

```js
import { runCleanup } from '../scraper/cleanup.js';

describe('runCleanup', () => {
  it('удаляет строки старше порога и возвращает счётчик', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 42 }) };
    const removed = await runCleanup(pool, 90);
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM price_history'), [90]);
    expect(removed).toBe(42);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `npx vitest run test/scraper.test.js`
Expected: FAIL — `Cannot find module '../scraper/cleanup.js'`.

- [ ] **Step 3: Реализовать `scraper/cleanup.js`**

```js
import { createPool } from './db.js';

export async function runCleanup(pool, days = 90) {
  const { rowCount } = await pool.query(
    'DELETE FROM price_history WHERE date < CURRENT_DATE - $1',
    [days],
  );
  return rowCount;
}

const args = process.argv.slice(2);
const daysArg = args.find(a => a.startsWith('--days='));
const days = daysArg ? parseInt(daysArg.split('=')[1]) : 90;

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL не задан — ретеншн пропущен');
  process.exit(0);
}

const pool = createPool(process.env.DATABASE_URL);
runCleanup(pool, days)
  .then(removed => {
    console.log(`Cleanup: removed ${removed} price_history rows older than ${days} days`);
    return pool.end();
  })
  .catch(async err => {
    console.error('Cleanup error:', err.message);
    await pool.end();
    process.exit(1);
  });
```

- [ ] **Step 4: Запустить, убедиться что зелёный**

Run: `npx vitest run test/scraper.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Обновить cron**

`.github/workflows/scrape-daily.yml`, секция `script:`:

```yaml
            cd /var/www/auto-analytics/app
            git pull origin master
            npm install
            AUTO_MIGRATE=1 node scraper/migrate.js
            node scraper/cleanup.js
            node scraper/index.js
            node scraper/rolf.js
```

- [ ] **Step 6: Скрипты package.json**

Добавить в `scripts`:
```json
"scrape:rolf": "node scraper/rolf.js",
"scrape:rolf:quick": "node scraper/rolf.js --pages=5",
"prune:history": "node scraper/cleanup.js"
```

- [ ] **Step 7: Smoke ретеншн на тестовой БД**

Run: `DATABASE_URL='postgres://root:o%2CL072Za%23%23@127.0.0.1:5433/auto_analytics_test' node scraper/cleanup.js`
Expected: `Cleanup: removed 0 price_history rows...` (нет данных старше 90 дней).

- [ ] **Step 8: Коммит**

```bash
git add scraper/cleanup.js .github/workflows/scrape-daily.yml package.json test/scraper.test.js
git commit -m "feat: rolf cron step and price_history retention cleanup"
```

---

### Task 5: Матчинг — `src/utils/matchCars.js`

**Files:**
- Create: `src/utils/matchCars.js`
- Test: `src/utils/matchCars.test.js`

**Interfaces:**
- Consumes: контракт Task 1 (реальные образцы `brand`/`model` и формат `engineCapacity`).
- Produces:
  - `normalizeSlug(s) → string`
  - `MODEL_ALIASES` (объект, стартовые записи из контракта)
  - `normalizeModel(model) → string`
  - `normalizeEngineVolume(v) → number|null` (см³ > 10 → литры, округление 0.1; иначе литры)
  - `matchKey(car) → string|null` (null при отсутствии year/engineVolume)
  - `findMatches(cars) → [{ key, carsBySource: Object<source, car> }]`

- [ ] **Step 1: Падающие тесты matchKey/findMatches**

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { matchKey, findMatches, normalizeEngineVolume, normalizeModel } from './matchCars.js';

describe('matchCars', () => {
  it('нормализует объём из см³ в литры', () => {
    expect(normalizeEngineVolume(2493)).toBe(2.5);
    expect(normalizeEngineVolume(2.5)).toBe(2.5);
    expect(normalizeEngineVolume(null)).toBeNull();
  });

  it('нормализует модель через алиасы и slug', () => {
    expect(normalizeModel('X5 xDrive40d')).toBe('x5 xdrive40d');
  });

  it('matchKey строгий по brand+model+year+engineVolume', () => {
    const a = { brand: 'BMW', model: 'X5 xDrive40d', year: 2021, engineVolume: 2993 };
    const b = { brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3 };
    const c = { brand: 'Audi', model: 'X5', year: 2021, engineVolume: 3 };
    expect(matchKey(a)).toBe(matchKey(b));
    expect(matchKey(a)).not.toBe(matchKey(c));
  });

  it('matchKey null при отсутствии year или engineVolume', () => {
    expect(matchKey({ brand: 'BMW', model: 'X5', year: null, engineVolume: 3 })).toBeNull();
    expect(matchKey({ brand: 'BMW', model: 'X5', year: 2021, engineVolume: null })).toBeNull();
  });

  it('findMatches возвращает пары только при двух источниках', () => {
    const cars = [
      { id: 1, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3, price: 100 },
      { id: 2, source: 'rolf', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3, price: 90 },
      { id: 3, source: 'rolf', brand: 'Audi', model: 'Q7', year: 2020, engineVolume: 3, price: 80 },
    ];
    const pairs = findMatches(cars);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].carsBySource['major-expert'].id).toBe(1);
    expect(pairs[0].carsBySource['rolf'].id).toBe(2);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `npx vitest run src/utils/matchCars.test.js`
Expected: FAIL — `Cannot find module './matchCars.js'`.

- [ ] **Step 3: Реализовать `src/utils/matchCars.js`**

```js
export function normalizeSlug(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const MODEL_ALIASES = {
  // стартовые записи — дополнить реальными из контракта Task 1
};

export function normalizeModel(model) {
  const slug = normalizeSlug(model);
  return MODEL_ALIASES[slug] || slug;
}

export function normalizeEngineVolume(v) {
  if (v == null) return null;
  const n = Number(v);
  if (Number.isNaN(n) || n <= 0) return null;
  return n > 10 ? Math.round((n / 1000) * 10) / 10 : Math.round(n * 10) / 10;
}

export function matchKey(car) {
  const year = car.year == null ? null : Number(car.year);
  const volume = normalizeEngineVolume(car.engineVolume);
  if (year == null || volume == null) return null;
  return [normalizeSlug(car.brand), normalizeModel(car.model), String(year), String(volume)].join('|');
}

export function findMatches(cars) {
  const groups = new Map();
  for (const car of cars) {
    const key = matchKey(car);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(car.source, car);
  }
  const pairs = [];
  for (const [key, bySource] of groups) {
    if (bySource.size < 2) continue;
    pairs.push({ key, carsBySource: Object.fromEntries(bySource) });
  }
  return pairs;
}
```

- [ ] **Step 4: Запустить, убедиться что зелёный**

Run: `npx vitest run src/utils/matchCars.test.js && npm test`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add src/utils/matchCars.js src/utils/matchCars.test.js
git commit -m "feat: cross-source match key and findMatches util"
```

---

### Task 6: Фильтр «Источник» + трешинг скаттера в дашборде

**Files:**
- Modify: `src/App.jsx` (фильтр источника, `/api/meta`, перезапрос `/api/history` по источнику)
- Create: `src/utils/thinPoints.js` (трешинг точек)
- Test: `src/utils/thinPoints.test.js`, `src/App.test.jsx`

**Interfaces:**
- Consumes: `findMatches` из Task 5 (не здесь), `/api/meta` (sources), `thinPoints`.
- Produces:
  - `src/utils/thinPoints.js`: `export function thinPoints(points, cap)` (равномерная выборка, сохраняет первый и последний), `export function thinSeries(series, maxPoints)` (пропорциональные кэпы).
  - `App.jsx`: стейт `sourceFilter` (`'all'`|source), селект с `aria-label="Источник"`, фильтр в `baseFiltered`, перезапрос `/api/history?source=` при смене.

- [ ] **Step 1: Падающие тесты thinPoints**

```js
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { thinPoints, thinSeries } from './thinPoints.js';

describe('thinPoints', () => {
  const pts = Array.from({ length: 100 }, (_, i) => ({ i }));

  it('возвращает точки без изменений до cap', () => {
    const out = thinPoints(pts, 200);
    expect(out).toHaveLength(100);
  });

  it('урезает и сохраняет первую и последнюю точку', () => {
    const out = thinPoints(pts, 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out[0].i).toBe(0);
    expect(out[out.length - 1].i).toBe(99);
  });

  it('детерминирован', () => {
    expect(thinPoints(pts, 10)).toEqual(thinPoints(pts, 10));
  });
});

describe('thinSeries', () => {
  it('не трогает серии в пределах лимита', () => {
    const series = [{ brand: 'A', data: [{ i: 1 }] }];
    expect(thinSeries(series, 2000)).toBe(series);
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `npx vitest run src/utils/thinPoints.test.js`
Expected: FAIL — `Cannot find module './thinPoints.js'`.

- [ ] **Step 3: Реализовать `src/utils/thinPoints.js`**

```js
export function thinPoints(points, cap) {
  if (!Number.isInteger(cap) || cap <= 0) return points;
  if (points.length <= cap) return points;
  const step = points.length / cap;
  const out = [];
  for (let i = 0; i < cap - 1; i++) out.push(points[Math.min(points.length - 1, Math.floor(i * step))]);
  out.push(points[points.length - 1]);
  return out;
}

export function thinSeries(series, maxPoints) {
  const total = series.reduce((n, s) => n + s.data.length, 0);
  if (total <= maxPoints) return series;
  const cap = Math.max(1, Math.floor(maxPoints / series.length));
  return series.map(s => ({ ...s, data: thinPoints(s.data, cap) }));
}
```

- [ ] **Step 4: Запустить, убедиться что зелёный**

Run: `npx vitest run src/utils/thinPoints.test.js`
Expected: PASS.

- [ ] **Step 5: Обновить App.test.jsx (индексы комбобоксов и мок /api/meta)**

В `beforeEach` мок fetch по URL:
```js
vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
  json: () => {
    if (url === '/api/offers') return Promise.resolve(offers);
    if (url === '/api/meta') return Promise.resolve({ sources: ['major-expert'], brands: ['Toyota', 'BMW', 'Lada'], years: [2019, 2020, 2021, 2022, 2023] });
    return Promise.resolve(history);
  },
})));
```
Индексы комбобоксов: новый «Источник» добавляется первым селектом в панель → и существующие тесты используют `combobox[0]` (brand), `combobox[1]` (yearFrom), `combobox[3]` (bodyType) — сдвиг: `combobox[1]` (brand), `combobox[2]` (yearFrom), `combobox[4]` (bodyType). Обновить строки тестов «filters by brand», «filters by body type», «filters by year range», «resets body type» и «renders all filter controls» (ожидание 5 комбобоксов + текст «Все источники»).

- [ ] **Step 6: Добавить тест фильтра источника (локальный мок со вторым источником)**

В `src/App.test.jsx` новый describe:
```js
describe('Источник filter', () => {
  const mixed = [
    ...offers,
    { id: 101, source: 'rolf', brand: 'BMW', model: 'X5', year: 2022, price: 5100000, mileage: 22000, bodyType: 'Внедорожник', fuelType: 'Дизель', engineVolume: 3.0, horsepower: 286, url: 'https://rolf.ru/101', image: '' },
    { id: 102, source: 'rolf', brand: 'Lada', model: 'Granta', year: 2023, price: 850000, mileage: 4000, bodyType: 'Седан', fuelType: 'Бензин', engineVolume: 1.6, horsepower: 98, url: 'https://rolf.ru/102', image: '' },
  ];

  it('переключает объявления и подпись по источнику', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => Promise.resolve({
      json: () => {
        if (url === '/api/offers') return Promise.resolve(mixed);
        if (url === '/api/meta') return Promise.resolve({ sources: ['major-expert', 'rolf'], brands: [], years: [] });
        return Promise.resolve({ dates: [], byDate: {} });
      },
    })));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText('Все источники');
    await user.selectOptions(screen.getByLabelText('Источник'), 'rolf');
    await screen.findByText(/2 объявлений/);
  });
});
```

- [ ] **Step 7: Реализовать фильтр источника в App.jsx**

- Состояние: `const [sourceFilter, setSourceFilter] = useState('all');` и `const [metaSources, setMetaSources] = useState([]);`.
- В `loadData()` (useEffect, зависящий от `sourceFilter`): получить `Promise.all([fetch('/api/offers'), fetch('/api/history' + (sourceFilter !== 'all' ? `?source=${sourceFilter}` : '')), fetch('/api/meta')])`; `meta` → `setMetaSources(meta.sources || [])` (только на монтировании — сделать это один раз вне зависимости; `setSourceFilter` не зависит кольцом).
- В `baseFiltered`: `if (sourceFilter !== 'all') result = result.filter(c => c.source === sourceFilter);` — добавить в зависимости `sourceFilter`.
- В панель фильтров первым селектом:
```jsx
<select value={sourceFilter} onChange={e => setSourceFilter(e.target.value)} aria-label="Источник">
  <option value="all">Все источники</option>
  {metaSources.map(s => <option key={s} value={s}>{s === 'major-expert' ? 'major-expert' : s}</option>)}
</select>
```
- Для рассинхрона: если `sourceFilter` не в `metaSources` и не 'all' — сбросить в 'all' (useEffect, по аналогии с `bodyTypeFilter`).

- [ ] **Step 8: Применить трешинг к скаттеру**

В `App.jsx` перед рендером `scatterSeries`:
```js
import { thinSeries } from './utils/thinPoints.js';
...
const scatterSeriesLimited = useMemo(() => thinSeries(scatterSeries, 2000), [scatterSeries]);
```
Рендерить `scatterSeriesLimited` в `ScatterChart` и передавать в `TrendLines`.

- [ ] **Step 9: Прогнать тесты и сборку**

Run: `npm test && npm run build`
Expected: PASS; сборка чистая.

- [ ] **Step 10: Коммит**

```bash
git add src/App.jsx src/utils/thinPoints.js src/utils/thinPoints.test.js src/App.test.jsx
git commit -m "feat: source filter and scatter point thinning in dashboard"
```

---

### Task 7: Секция «Сравнение источников»

**Files:**
- Create: `src/components/SourceComparison.jsx`
- Modify: `src/App.jsx` (рендер секции ниже «Лучших предложений»)
- Modify: `src/App.css` (стили блока, двухколоночный layout)
- Test: `src/components/SourceComparison.test.jsx`

**Interfaces:**
- Consumes: `findMatches(cars)` (Task 5), `formatPrice`, `formatMileage` из `src/utils/scoreCalculator.js`, props `cars` (отфильтрованные/посчитанные объявления), `sources` (из `/api/meta`).
- Produces: `export default function SourceComparison({ cars, sources })` — рендерит header + счётчик пар; пустое состояние; для пары две колонки по source.

- [ ] **Step 1: Падающие тесты компонента**

```js
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SourceComparison from './SourceComparison';

const sources = ['major-expert', 'rolf'];

const pair = {
  'major-expert': { id: 1, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3, mileage: 40000, price: 4500000, horsepower: 286, transmission: 'АКПП', driveType: 'Полный привод', color: 'серый', owners: 1, url: 'https://me.ru/1', image: '' },
  'rolf': { id: 2, source: 'rolf', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3, mileage: 30000, price: 4200000, horsepower: 286, transmission: 'АКПП', driveType: 'Полный привод', color: 'чёрный', owners: null, url: 'https://rolf.ru/2', image: '' },
};

describe('SourceComparison', () => {
  it('показывает пустое состояние при отсутствии пар', () => {
    render(<SourceComparison cars={[{ id: 1, source: 'major-expert', brand: 'BMW', model: 'X5', year: 2021, engineVolume: 3 }]} sources={sources} />);
    expect(screen.getByText(/Нет авто, встречающихся на обоих источниках/)).toBeInTheDocument();
  });

  it('рендерит пару с двумя колонками и highlight', () => {
    render(<SourceComparison cars={[pair['major-expert'], pair.rolf]} sources={sources} />);
    expect(screen.getByText('Сравнение источников')).toBeInTheDocument();
    expect(screen.getByText(/major-expert/)).toBeInTheDocument();
    expect(screen.getByText(/rolf/)).toBeInTheDocument();
    expect(screen.getByText(/4 200 000/)).toBeInTheDocument(); // дешевле - highlight
    expect(screen.getByText(/30 000 км/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Запустить, убедиться что падает**

Run: `npx vitest run src/components/SourceComparison.test.jsx`
Expected: FAIL — `Cannot find module './SourceComparison'`.

- [ ] **Step 3: Реализовать `src/components/SourceComparison.jsx`**

```jsx
import React, { useMemo } from 'react';
import { findMatches } from '../utils/matchCars.js';
import { formatPrice, formatMileage } from '../utils/scoreCalculator.js';

const FIELDS = [
  { key: 'price', label: 'Цена', format: v => formatPrice(v) },
  { key: 'mileage', label: 'Пробег', format: v => formatMileage(v) },
  { key: 'year', label: 'Год' },
  { key: 'engineVolume', label: 'Объём', format: v => v == null ? null : `${v} л` },
  { key: 'horsepower', label: 'Мощность', format: v => v == null ? null : `${v} л.с.` },
  { key: 'transmission', label: 'КПП' },
  { key: 'driveType', label: 'Привод' },
  { key: 'color', label: 'Цвет' },
  { key: 'owners', label: 'Владельцы' },
];

function highlightClass(name, a, b) {
  if (a == null || b == null) return '';
  if (name === 'price') return a < b ? 'cmp-hl' : '';
  if (name === 'mileage') return a < b ? 'cmp-hl' : '';
  return '';
}

export default function SourceComparison({ cars, sources }) {
  const pairs = useMemo(() => findMatches(cars), [cars]);

  if (pairs.length === 0) {
    return (
      <div className="deals-section">
        <h2>Сравнение источников</h2>
        <p className="empty-note">Нет авто, встречающихся на обоих источниках</p>
      </div>
    );
  }

  return (
    <div className="deals-section">
      <div className="section-header">
        <h2>Сравнение источников <span className="count-badge">{pairs.length}</span></h2>
      </div>
      <div className="comparison-list">
        {pairs.map(pair => (
          <div key={pair.key} className="comparison-row">
            {sources.map(source => {
              const car = pair.carsBySource[source];
              if (!car) return null;
              return (
                <div key={source} className="comparison-col">
                  <h4>{source === 'major-expert' ? 'major-expert' : source}</h4>
                  <p className="cmp-name">{car.brand} {car.model} · {car.year}</p>
                  <table className="cmp-table">
                    <tbody>
                      {FIELDS.map(f => {
                        const other = sources.map(s => pair.carsBySource[s]?.[f.key]).find(v => v != null && v !== car[f.key]);
                        const value = car[f.key];
                        return (
                          <tr key={f.key} className={highlightClass(f.key, value, other)}>
                            <td>{f.label}</td>
                            <td>{value == null ? '—' : (f.format ? f.format(value) : String(value))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {car.url && <a href={car.url} target="_blank" rel="noopener noreferrer">Смотреть на сайте →</a>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

Примечание: highlight-логика «дешевле/менее пробег» сравнивает текущее поле с «другим» значением пары; класс `cmp-hl` стилизуется в App.css.

- [ ] **Step 4: Стили в `src/App.css`**

Добавить в конец:
```css
.comparison-list { display: flex; flex-direction: column; gap: 16px; }
.comparison-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; border: 1px solid #eee; border-radius: 8px; padding: 16px; }
.comparison-col h4 { margin: 0 0 8px; color: #333; }
.cmp-name { margin: 0 0 8px; font-weight: 600; }
.cmp-table { width: 100%; border-collapse: collapse; }
.cmp-table td { padding: 4px 8px; border-bottom: 1px solid #f0f0f0; }
.cmp-hl td:last-child { color: #48b803; font-weight: 700; }
```

- [ ] **Step 5: Подключить в App.jsx**

Импорт `import SourceComparison from './components/SourceComparison.jsx';`. Рендер после секции «Лучшие предложения» (после `</div>` блока `bestDeals`):
```jsx
<SourceComparison cars={segmentedCars} sources={metaSources} />
```

- [ ] **Step 6: Прогнать тесты и сборку**

Run: `npm test && npm run build`
Expected: PASS; новое пустое состояние не ломает существующие тесты (у них нет пар).

- [ ] **Step 7: Коммит**

```bash
git add src/components/SourceComparison.jsx src/components/SourceComparison.test.jsx src/App.jsx src/App.css
git commit -m "feat: cross-source comparison section in dashboard"
```

---

### Task 8: Интеграционная проверка на сервере (verification)

Read-only + данные тестовой БД; код не меняется.

- [ ] **Step 1: Поднять туннель к серверной БД**

Run: `ssh -f -N -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -L 5433:127.0.0.1:5432 root@90.156.129.73` (expect-хелпер при необходимости; учётные данные в лжеджере SDD).
Verify: `nc -z -G 5 127.0.0.1 5433`.

- [ ] **Step 2: Полный прогон rolf-скрапера на тестовую БД**

Run: `DATABASE_URL='postgres://root:o%2CL072Za%23%23@127.0.0.1:5433/auto_analytics_test' node scraper/rolf.js --pages=5`
Expected: `DB sync: N new, 0 updated, 0 deactivated` без WARNING.

- [ ] **Step 3: Проверка API с limit и days**

Run:
```bash
curl -s 'http://localhost:3001/api/offers?source=rolf&limit=3' | grep -c '"source":"rolf"'
curl -s 'http://localhost:3001/api/history?days=3650&source=rolf' | grep -c 'byDate'
```
(локально: `npm run server` с `DATABASE_URL` тестовой БД). Expected: первый ≥ 0 и все элементы rolf; второй — `byDate` присутствует.

- [ ] **Step 4: Проверка на продакшен-сайте (read только)**

Run: `curl -s 'https://www.rolf.ru/cars/used/' | grep -c 'window.__NUXT__'` — подтвердить, что SSR-данные на месте (актуально, если выбран cheerio-режим).
Expected: ≥ 1.

- [ ] **Step 5: UI-проверка секции сравнения**

Run: `npm run dev`, руками открыть дашборд против сервера (`localhost:5173` + прокси), включить «major-expert» и «rolf» — секция «Сравнение источников» показывает пары (или пустое состояние). Проверить, что фильтр «Источник» переключает данные и историю.

- [ ] **Step 6: Полный стек тестов и сборка**

Run: `npm test && npm run build && grep -c 'S-Класс' dist/assets/*.js`
Expected: PASS; сборка чистая; grep = 0.

- [ ] **Step 7: Закрыть туннель**

Run: kill SSH-процесса туннеля; `nc -z -G 3 127.0.0.1 5433` → connection refused.

- [ ] **Step 8: Отчёт в лжеджер**

Записать результаты проверки в `.superpowers/sdd/2026-09-05-rolf-source/comparison/task-8-verify-report.md` (счётчики, API-ответы, вывод UI-проверки). Git status чистый (код не менялся).

---

## Self-Review (checklist зафиксирован)

- **Spec coverage:** спека → задачи: парсер write (T2), cron (T4), limit/days (T3), фильтр источника (T6), трешинг (T6), матчинг (T5), секция сравнения (T7), ретеншн (T4), интеграционная проверка (T8). Спайк-выбор JSON/cheerio — T1 с обязательным контрактом.
- **Placeholders:** каркас `scraper/rolf.js` содержит конкретику; ветка cheerio и алиасы словаря явно делегированы контракту T1 (реальные данные спайка), что является зависимостью спайка, а не «TODO».
- **Type consistency:** `normalizeRolfItem → car` без `source`; `applySync({source:'rolf', ...})`; `matchKey/findMatches` сигнатуры совпадают между T5 и T7; thinPoints/thinSeries — T6.
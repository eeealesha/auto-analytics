# AGENTS.md

## Project: Major Expert Auto Analytics

React-дашборд, парсит объявления с major-expert.ru и строит интерактивные графики рынка б/у авто в Москве. Включает "Score выгодности" — метрику для поиска лучших предложений.

## Tech Stack

- **Frontend:** React 19 + Vite 8
- **Charts:** Recharts
- **Scraping:** Node.js + axios (JSON API; cheerio в deps, но не используется)
- **State:** React hooks (useState/useEffect)
- **Тестов и линтера нет** — единственная проверка: `npm run build`

## Data Source

- **Сайт:** https://www.major-expert.ru/
- **API:** `POST https://www.major-expert.ru/api/v1/public/cars/items-by-url`
- **Тело запроса:** `{ url: "/cars/moscow/", page: N, perPage: 12, orderBy: "popular" }`
- **Пагинация:** 206 страниц, ~12 авто на странице, всего ~2470 объявлений
- **Данные:** brandName, modelName, year, mileage, engine, engineVolume, enginePower, gearbox, driveType, price, body, color
- **Нормализованные поля в JSON:** brand, model, name, year, mileage, bodyType, fuelType, engineVolume, horsepower, transmission, driveType, color, owners, price, oldPrice, url, image, isNew
- Парсинг пишет в PostgreSQL (если задан `DATABASE_URL`); содержимое `data/history/*.json` больше не используется дашбордом (история цен из `/api/history`)

## Commands

```bash
npm run dev          # Vite dev server (порт 5173)
npm run scrape       # Парсинг всех страниц → data/cars.json + снапшот в data/history/
npm run scrape:quick # Парсинг 5 страниц для тестов
npm run build        # Production сборка → dist/
npm run preview      # Предпросмотр production сборки
npm run migrate      # Создать схему PostgreSQL (требует DATABASE_URL)
npm run server       # Запустить Express API на :3001 (требует DATABASE_URL)
cp data/cars.sample.json data/cars.json  # старт без парсинга (обезличенный сэмпл 50 авто)
```

## Score Выгодности

Считается в `src/utils/scoreCalculator.js` по группам `brand + model`:

```
priceDiff    = (avg_price - current_price) / avg_price * 100
mileageBonus = (avg_mileage - mileage) / avg_mileage * 10
yearBonus    = (year - avg_year) * 3
score        = round(priceDiff + mileageBonus + yearBonus)
```

- < 2 машин в группе → score 0, label "Мало данных"
- Score > 20 = "Отличная сделка", 10-20 = "Хорошая сделка", иначе "Средняя"
- Фильтр «Только выгодные» в UI = score > 10

## Deployment

- **GitHub:** https://github.com/eeealesha/auto-analytics
- **Server:** 90.156.129.73 (nginx)
- **CI/CD:** `.github/workflows/deploy.yml`, триггер — push в master
- **Flow:** SSH → git pull → npm install → scrape → build → reload nginx
- **Secrets в GitHub Actions:** DEPLOY_HOST, DEPLOY_USER, DEPLOY_PASSWORD

## Gotchas

- **`src/App.jsx` импортирует `../data/cars.json` напрямую** — данные вшиваются в бандл при сборке. Без файла `npm run dev`/`build` падают: сначала `cp data/cars.sample.json data/cars.json` или `npm run scrape`.
- Цены в API уже числа (28200000), не строки
- Пробег 100 км = новый авто, фильтровать как "новый"
- Rate limit: 300ms задержка между запросами
- User-Agent: ставить обычный браузерный
- Парсер дедуплицирует машины по `id`
- data/cars.json — кэш, коммитить не надо (содержит ~2470 записей)
- data/history/YYYY-MM-DD.json — ежедневные снапшоты для истории цен (тоже gitignored)
- data/cars.sample.json — обезличенные 50 машин без url и фото; нужен только для локального запуска
- DATABASE_URL (postgres://…) обязателен для записи в БД и запуска API
- Пароль в DATABASE_URL с символами `#`, `,`, `@`, `%` нужно указывать URL-encoded (например `#` → `%23`, `,` → `%2C`), иначе pg выдаст «Invalid URL»
- Cron ежедневно 03:00 МСК: .github/workflows/scrape-daily.yml
- Дашборд читает /api/offers, /api/history, /api/meta (nginx проксирует /api на :3001)

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles map to matching label strings. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

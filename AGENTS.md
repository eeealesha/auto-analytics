# AGENTS.md

## Project: Major Expert Auto Analytics

React-дашборд, парсит объявления с major-expert.ru и строит интерактивные графики рынка б/у авто в Москве. Включает "Score выгодности" — метрику для поиска лучших предложений.

## Tech Stack

- **Frontend:** React 18 + Vite
- **Charts:** Recharts
- **Scraping:** Node.js + axios (JSON API, cheerio не нужен)
- **State:** React hooks (useState/useEffect)

## Data Source

- **Сайт:** https://www.major-expert.ru/
- **API:** `POST https://www.major-expert.ru/api/v1/public/cars/items-by-url`
- **Тело запроса:** `{ url: "/cars/moscow/", page: N, perPage: 12, orderBy: "popular" }`
- **Пагинация:** 206 страниц, ~12 авто на странице, всего ~2470 объявлений
- **Данные:** brandName, modelName, year, mileage, engine, engineVolume, enginePower, gearbox, driveType, price, body, color
- Парсинг пишет в PostgreSQL (если задан `DATABASE_URL`); содержимое `data/history/*.json` больше не используется дашбордом (история цен из `/api/history`)

## Commands

```bash
npm run dev          # Vite dev server (порт 5173)
npm run scrape       # Парсинг всех страниц → data/cars.json
npm run scrape:quick # Парсинг 5 страниц для тестов
npm run build        # Production сборка → dist/
npm run preview      # Предпросмотр production сборки
npm run migrate      # Создать схему PostgreSQL (требует DATABASE_URL)
npm run server       # Запустить Express API на :3001 (требует DATABASE_URL)
```

## Score Выгодности

```
score = (avg_price - current_price) / avg_price * 100 + mileage_bonus + year_bonus
```

- Score > 20 = "Отличная сделка"
- Score 10-20 = "Хорошая сделка"
- Score < 10 = "Средняя"

## Deployment

- **GitHub:** https://github.com/eeealesha/auto-analytics
- **Server:** 90.156.129.73 (nginx)
- **CI/CD:** GitHub Actions (`.github/workflows/deploy.yml`)
- **Deploy trigger:** push to master → SSH → pull → scrape → build → reload nginx

## Gotchas

- Цены в API уже числа (28200000), не строки
- Пробег 100 км = новый авто, фильтровать как "новый"
- Rate limit: 300ms задержка между запросами
- User-Agent: ставить обычный браузерный
- data/cars.json — кэш, коммитить не надо (содержит ~2470 записей)
- DATABASE_URL (postgres://…) обязателен для записи в БД и запуска API
- Пароль в DATABASE_URL с символами `#`, `,`, `@`, `%` нужно указывать URL-encoded (например `#` → `%23`, `,` → `%2C`), иначе pg выдаст «Invalid URL»
- Cron ежедневно 03:00 МСК: .github/workflows/scrape-daily.yml
- Дашборд читает /api/offers, /api/history, /api/meta (nginx проксирует /api на :3001)

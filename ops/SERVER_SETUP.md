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

> Пароль в `DATABASE_URL` нужно URL-кодировать, если он содержит спецсимволы
> (`#`, `,`, `@`, `%` и др.). Например `#` → `%23`, `,` → `%2C`. Иначе pg
> выдаст «Invalid URL» (символ `#` воспринимается как начало URL-fragment).

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

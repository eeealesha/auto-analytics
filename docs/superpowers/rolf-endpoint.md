# Контракт веб-источника: rolf.ru (б/у авто, Москва)

Статус: спайк подтверждён (2026-09-05). Режим: **json**.

## Транспорт

- **mode**: `json`
- **method**: `GET`
- **Базовый URL**: `https://apiweb.rolf.ru`
- **Endpoint**: `/api/v2/vehicles/used`
- **Полный URL**:
  `https://apiweb.rolf.ru/api/v2/vehicles/used?city_id=1&per_page=24&page=1`
- **Заголовки**: только браузерный User-Agent, напр.
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36`.
  Ключи/токены не нужны (`content-type: application/json` в ответе).
- **Ограничения**: пробовали также `/api/v2/vehicles` (404), `/api/v2/cars/used` (404),
  `/api/v2/stock` (404), `/api/v2/vehicles/used?city=msk` (200, но `city` игнорируется —
  возвращает все города 7812). Рабочий фильтр по городу — **`city_id`**, где Москва = `1`.

## Параметры запроса

| Параметр | Значение | Примечание |
|---|---|---|
| `city_id` | `1` (Москва) | обязателен для фильтра по Москве |
| `per_page` | `24` (также 20 по умолчанию, 48, 60 из `per_page_options`) | |
| `page` | `1..N` | 1-based |

- Путь `/vehicles/used` уже означает `vehicle_type=used`, `type=car` (все `items[].type === "car"`).
- Отдельные параметры `vehicle_type`/`type` из fetch-cache-ключа SPA к этому пути добавлять не нужно.

## Ответ и пагинация

```
{ "success": true, "data": { "items": [...], "total_count": N, "pagination": {...}, ... } }
```

- **Массив предложений**: `data.items`
- **Общее число**: `data.total_count`
- **Поля пагинации**: `data.pagination.per_page`, `data.pagination.current_page`,
  `data.pagination.last_page`, `data.pagination.total`
  (аналог `lastPage` = `data.pagination.last_page`; `total` = `data.pagination.total` и дублируется в `data.total_count`).

### Объём Москва (24/стр)

- `total` = **3828**, `last_page` = **160**, `per_page` = **24**
- (при `per_page=20`: total 3828, last_page 192)

## Маппинг item → колонки `offers`

| Колонка `offers` | Поле API | Пример | Нормализация |
|---|---|---|---|
| `id` | `id` (число) | `24596498` | строкой; `external_id` — альтернатива, `vin[0]` — референс |
| `brand` | `brand.name`, алиас `brand.alias` | `Mercedes-Benz` / `mercedes_benz` | для словаря алиасов Task 5 использовать `brand.alias` |
| `model` | `model.name`, алиас `model.alias` | `G-Класс` / `g-klass` | `model.name` — с русской деклинацией (`5 серии`); в URL — `model.alias` |
| `name` | `brand.name + " " + model.name [ + complectation]` | `Mercedes-Benz G-Класс G 450 d AMG Line` | собирается вручную | 
| `year` | `year` (или `model_year`, совпадают) | `2025` | |
| `mileage` | `mileage` | `13900` | км, число |
| `body_type` | `body` (имя) / `body_id` | `Внедорожник` / `4` | использовать `body` (уже имя) |
| `fuel_type` | `engine_type` (имя) / `engine_type_id` | `Дизель` / `2` | использовать `engine_type` |
| `engine_volume` | `engine_capacity` | `3000` | **см³** → делить на 1000 и округлять до 0.1 (3000 → 3.0) |
| `horsepower` | `engine_power` | `367` | |
| `transmission` | `transmission` (имя) / `transmission_id` | `Автоматическая` / `1` | использовать `transmission` |
| `drive_type` | `drive_wheel` (имя) / `drive_wheel_id` | `Полный` / `3` | использовать `drive_wheel` |
| `color` | `color_name` (или `original_color_name`) | `Чёрный` | также `color_id`, `original_color_hex` (напр. `000000`) |
| `owners` | `owners_number` | `0`, `1` | `0` = новых/с пробегом у дилера (нет данных о владельцах) |
| `price` | `price` | `20486700` | рубли, число (не строка) |
| `old_price` | `price_old` (часто `null`) | `null` | если null — скидки нет; скидка в `discount` (рубли) |
| `url` | нет в API — собирать: `https://www.rolf.ru/cars/used/{brand.alias}/{model.alias}/{id}/` | `https://www.rolf.ru/cars/used/mercedes_benz/g-klass/24596498/` | HTTP 200; сервер редиректит на канонический `/brand/model/` |
| `image` | `images[0].url` (или любой из `images[].url`) | `https://apiweb.rolf.ru/storage/thumbnails/small/vehicles/used/24596498/b53ae4f8cd3214e5ced3effc6eb302b3.webp` | |

### Поле `url` — важная деталь

В API нет поля ссылки на объявление. URL строится из алиасов:
`https://www.rolf.ru/cars/used/{brand.alias}/{model.alias}/{id}/`. Формат подтверждён
в SSR-разметке (`href="/cars/used/mercedes_benz/g-klass/24585336/"`) и отвечает HTTP 200.

### Прочее, что есть в item

`salon` (дилерский продающий центр), `dealer` (дилер, напр. `{id:9,name:"РОЛЬФ Алтуфьево",alias:"rolf_altufevo"}`),
`city` (напр. `{id:1,name:"Москва",alias:"msk"}`), `generation`, `doors_count`,
`interior`, `is_sold`, `is_reserved`, `vin[]`, `warranty_name`, `description_small`,
дисконтные поля `discount_credit/trade_in/insurance/max`, `ecredit_*`.

## Словарь (реальные образцы для калибровки алиасов Task 5)

Из фикстуры первой страницы (brand.alias / brand.name | model.alias / model.name):

| brand.alias | brand.name | model.alias | model.name |
|---|---|---|---|
| `mercedes_benz` | Mercedes-Benz | `g-klass` | G-Класс |
| `land_rover` | Land Rover | `range_rover` | Range Rover |
| `tank` | Tank | `700` | 700 |
| `omoda` | OMODA | `c5` | C5 |
| `bmw` | BMW | `5er` | 5 серии |
| `voyah` | Voyah | `free` | FREE |
| `tagaz` | ТагАЗ | `tager` | Tager |
| `lexus` | Lexus | `lx` | LX |

## Фикстура

- `test/fixtures/rolf-vehicles-page-1.json` — реальный ответ
  `GET /api/v2/vehicles/used?city_id=1&per_page=24&page=1` (192301 байт, 24 item).
- Симуляция в проде: такой же GET; rate-limit и UA — как в AGENTS.md (300 мс, браузерный UA).

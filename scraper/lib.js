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

// Доля от заявленного total, ниже которой прогон считаем неполным.
const MIN_COVERAGE = 0.5;

// Прогон неполный, если страницы падали ИЛИ выкачана малая доля от заявленного
// количества. Второе ловит смену формата пагинации у источника: ошибок нет,
// lastPage выродился в 0, и без этой проверки деактивация вычистила бы источник.
export function isPartialScrape({ failedPages = 0, scraped = 0, total = 0 } = {}) {
  if (failedPages > 0) return true;
  if (total > 0 && scraped < total * MIN_COVERAGE) return true;
  return false;
}

// offers.price объявлен BIGINT NOT NULL: одно объявление без цены откатило бы
// всю транзакцию, поэтому такие отсеиваем до синхронизации.
export function syncableCars(cars) {
  return cars.filter(car => {
    const price = Number(car.price);
    return Number.isFinite(price) && price > 0;
  });
}

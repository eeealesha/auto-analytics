import fs from 'fs';
import path from 'path';
import { HEADERS, delay, ensureDirs, deduplicate, isPartialScrape, syncableCars } from './lib.js';
import { createPool, initSchema, applySync } from './db.js';
import axios from 'axios';

const API_URL = process.env.ROLF_API_URL || 'https://apiweb.rolf.ru/api/v2/vehicles/used';
const CITY_ID = Number(process.env.ROLF_CITY_ID || 1);
const PER_PAGE = 24;
const DELAY_MS = 300;

export function normalizeRolfItem(item) {
  const id = item.id ?? item.external_id ?? item.vehicleId;
  const brand = item.brand?.name ?? item.brand ?? null;
  const model = item.model?.name ?? item.model ?? null;
  const complectation = item.complectation ?? null;
  const name = [brand, model, complectation].filter(Boolean).join(' ');
  const rawVolume = item.engine_capacity;
  const engineVolume = rawVolume == null ? null
    : Math.round((Number(rawVolume) / 1000) * 10) / 10;
  const brandAlias = item.brand?.alias;
  const modelAlias = item.model?.alias;
  const url = brandAlias && modelAlias && id
    ? `https://www.rolf.ru/cars/used/${brandAlias}/${modelAlias}/${id}/`
    : null;
  return {
    id,
    brand,
    model,
    name,
    year: item.year ?? item.model_year ?? null,
    mileage: item.mileage ?? null,
    bodyType: item.body ?? item.bodyType ?? null,
    fuelType: item.engine_type ?? null,
    engineVolume,
    horsepower: item.engine_power ?? null,
    transmission: item.transmission ?? null,
    driveType: item.drive_wheel ?? null,
    color: item.color_name ?? item.original_color_name ?? null,
    owners: item.owners_number ?? 0,
    price: item.price ?? null,
    oldPrice: item.price_old ?? null,
    url,
    image: item.images?.[0]?.url ?? item.image ?? null,
    isNew: false,
  };
}

export async function fetchPage(page) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.get(API_URL, {
        params: { city_id: CITY_ID, per_page: PER_PAGE, page },
        headers: HEADERS,
        timeout: 15000,
      });
      const data = response.data?.data ?? response.data ?? {};
      const items = data.items ?? data.data ?? data.vehicles ?? [];
      const pagination = data.pagination ?? {};
      return {
        cars: items.map(normalizeRolfItem),
        total: data.total_count ?? data.total ?? 0,
        lastPage: pagination.last_page ?? data.lastPage ?? 0,
        ok: true,
      };
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
      const partial = isPartialScrape({ failedPages, scraped: uniqueCars.length, total: first.total });
      if (partial) {
        console.warn(`  WARNING: partial scrape (${failedPages} failed page(s), ${uniqueCars.length}/${first.total} offers) — deactivation skipped`);
      }
      const cars = syncableCars(uniqueCars);
      const skipped = uniqueCars.length - cars.length;
      if (skipped > 0) console.warn(`  WARNING: ${skipped} offer(s) without a price skipped`);
      const result = await applySync(pool, {
        source: 'rolf',
        cars,
        today: new Date().toISOString().split('T')[0],
        deactivate: !partial,
      });
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
scrapeAll(pagesArg ? parseInt(pagesArg.split('=')[1]) : Infinity).catch(err => {
  console.error(err);
  process.exit(1);
});

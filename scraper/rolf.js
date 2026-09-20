import axios from 'axios';
import { HEADERS, delay, runPipeline } from './lib.js';

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

const args = process.argv.slice(2);
const pagesArg = args.find(a => a.startsWith('--pages='));
const maxPages = pagesArg ? parseInt(pagesArg.split('=')[1]) : Infinity;

runPipeline({
  source: 'rolf',
  fetchPage,
  filename: 'cars-rolf.json',
  writeHistory: false,
  maxPages,
  delayMs: DELAY_MS,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

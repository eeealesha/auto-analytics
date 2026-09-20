import axios from 'axios';
import { HEADERS, delay, runPipeline } from './lib.js';

const API_URL = 'https://www.major-expert.ru/api/v1/public/cars/items-by-url';
const PER_PAGE = 12;
const DELAY_MS = 300;

function normalizeCar(item) {
  const ch = item.characteristics || {};
  return {
    id: item.id,
    brand: item.brandName,
    model: item.modelName,
    name: item.name,
    year: ch.year?.value || null,
    mileage: ch.run?.value || null,
    bodyType: ch.body?.value || null,
    fuelType: ch.engine?.value || null,
    engineVolume: ch.engineCapacity ? parseFloat(ch.engineCapacity.value) : null,
    horsepower: ch.enginePower?.value || null,
    transmission: ch.gearbox?.value || null,
    driveType: ch.driveType?.value || null,
    color: ch.color?.value || null,
    owners: ch.owners?.value || null,
    price: item.price,
    oldPrice: item.hasDiscount ? item.fullPrice : null,
    url: item.url ? `https://www.major-expert.ru${item.url}` : null,
    image: item.media?.[0]?.image?.md || null,
    isNew: item.isNew || false,
  };
}

async function fetchPage(page) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await axios.post(API_URL, {
        url: '/cars/moscow/',
        page,
        perPage: PER_PAGE,
        orderBy: 'popular',
      }, { headers: HEADERS, timeout: 15000 });

      const data = response.data?.data;
      if (!data?.items) return { cars: [], total: 0, lastPage: 0, ok: false };

      return {
        cars: data.items.map(normalizeCar),
        total: data.pagination?.total || 0,
        lastPage: data.pagination?.lastPage || 0,
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
  source: 'major-expert',
  fetchPage,
  filename: 'cars.json',
  writeHistory: true,
  maxPages,
  delayMs: DELAY_MS,
}).catch(err => {
  console.error(err);
  process.exit(1);
});

export function normalizeSlug(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[^a-zа-яё0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export const MODEL_ALIASES = {};

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
  const brand = normalizeSlug(car.brand);
  const model = normalizeModel(car.model);
  const year = car.year == null ? null : Number(car.year);
  const volume = normalizeEngineVolume(car.engineVolume);
  if (!brand || !model || year == null || volume == null) return null;
  return [brand, model, String(year), String(volume)].join('|');
}

function cheapest(list) {
  return list.reduce((best, car) => {
    if (car.price == null) return best;
    if (best.price == null || car.price < best.price) return car;
    return best;
  });
}

export function findMatches(cars) {
  const groups = new Map();
  for (const car of cars) {
    const key = matchKey(car);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const bySource = groups.get(key);
    if (!bySource.has(car.source)) bySource.set(car.source, []);
    bySource.get(car.source).push(car);
  }
  const pairs = [];
  for (const [key, bySource] of groups) {
    if (bySource.size < 2) continue;
    const carsBySource = {};
    const countsBySource = {};
    for (const [source, list] of bySource) {
      // Источник представляет самое дешёвое его предложение: именно оно отвечает
      // на вопрос «где дешевле». Раньше выживало последнее по порядку, из-за чего
      // сравнение могло указать на более дорогой источник.
      carsBySource[source] = cheapest(list);
      countsBySource[source] = list.length;
    }
    pairs.push({ key, carsBySource, countsBySource });
  }
  return pairs;
}

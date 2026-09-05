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

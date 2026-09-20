import { getCarsBySegment } from './segmentation';
import { calcAnnualMileage } from './usage';
import { thinSeries } from './thinPoints';
import { getCarClass } from './scoreCalculator';

export function applyBaseFilters(cars, { source, brand, yearFrom, yearTo, carClass, priceRange, showDealsOnly }) {
  let result = cars;
  if (source && source !== 'all') result = result.filter(c => c.source === source);
  if (brand && brand !== 'all') result = result.filter(c => c.brand === brand);
  if (yearFrom && yearFrom !== 'all') result = result.filter(c => c.year >= parseInt(yearFrom));
  if (yearTo && yearTo !== 'all') result = result.filter(c => c.year <= parseInt(yearTo));
  if (carClass && carClass !== 'all') result = result.filter(c => getCarClass(c) === carClass);
  if (priceRange) result = result.filter(c => c.price <= priceRange);
  if (showDealsOnly) result = result.filter(c => c.score > 10);
  return result;
}

export function applySegmentFilters(cars, { segment, thresholds, bodyType }) {
  let result = getCarsBySegment(cars, segment, thresholds);
  if (bodyType && bodyType !== 'all') {
    result = result.filter(c => c.bodyType === bodyType);
  }
  return result;
}

export function computeBodyTypes(cars) {
  const map = {};
  cars.forEach(c => {
    if (!c.bodyType) return;
    map[c.bodyType] = (map[c.bodyType] || 0) + 1;
  });
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
    .map(([bt]) => bt);
}

export function computePriceByBrand(cars) {
  const map = {};
  cars.forEach(c => {
    if (!map[c.brand]) map[c.brand] = { brand: c.brand, prices: [], count: 0 };
    map[c.brand].prices.push(c.price);
    map[c.brand].count++;
  });
  return Object.values(map)
    .map(d => ({
      brand: d.brand,
      avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
      count: d.count,
    }))
    .sort((a, b) => b.avgPrice - a.avgPrice)
    .slice(0, 10);
}

export function computeScatterData(cars) {
  const pts = cars
    .filter(c => c.mileage && c.mileage > 100 && c.mileage < 500000 && c.price > 0)
    .map(c => ({
      mileage: c.mileage,
      price: c.price,
      brand: c.brand,
      name: `${c.brand} ${c.model}`,
      annual: calcAnnualMileage(c),
    }));
  const counts = {};
  pts.forEach(p => { counts[p.brand] = (counts[p.brand] || 0) + 1; });
  const topBrands = new Set(
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([b]) => b)
  );
  return { topBrands, pts };
}

export function computeScatterSeries({ topBrands, pts }, colors) {
  const groups = {};
  topBrands.forEach(b => { groups[b] = []; });
  const other = [];
  pts.forEach(p => {
    if (topBrands.has(p.brand)) groups[p.brand].push(p);
    else other.push(p);
  });
  const series = Object.entries(groups).map(([brand, data], i) => ({
    brand,
    data,
    fill: colors[i % colors.length],
  }));
  if (other.length > 0) series.push({ brand: 'Другие', data: other, fill: '#9E9E9E' });
  return series;
}

export function computeLowUsage(cars, maxAnnual) {
  const withAnnual = cars
    .map(c => ({ ...c, annual: calcAnnualMileage(c) }))
    .filter(c => c.annual !== null);
  return withAnnual
    .filter(c => c.annual <= maxAnnual)
    .sort((a, b) => a.annual - b.annual)
    .slice(0, 8);
}

export function computeYearVsPrice(cars) {
  const map = {};
  cars.forEach(c => {
    if (!c.year) return;
    if (!map[c.year]) map[c.year] = { year: c.year, prices: [] };
    map[c.year].prices.push(c.price);
  });
  return Object.values(map)
    .map(d => ({
      year: d.year,
      avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
      count: d.prices.length,
    }))
    .sort((a, b) => a.year - b.year);
}

export function computeTopModels(cars) {
  const map = {};
  cars.forEach(c => {
    const key = `${c.brand} ${c.model}`;
    if (!map[key]) map[key] = { name: key, brand: c.brand, model: c.model, count: 0, prices: [], sampleUrl: c.url || null };
    map[key].count++;
    map[key].prices.push(c.price);
  });
  return Object.values(map)
    .map(d => ({
      ...d,
      avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
      listingUrl: d.sampleUrl ? d.sampleUrl.replace(/\/[^/]+\/$/, '/') : null,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function getBestDeals(cars, limit = 8) {
  return [...cars].sort((a, b) => b.score - a.score).slice(0, limit);
}

export function computeAvgMileage(cars) {
  const withMileage = cars.filter(c => c.mileage != null);
  if (withMileage.length === 0) return null;
  return Math.round(withMileage.reduce((a, c) => a + c.mileage, 0) / withMileage.length);
}

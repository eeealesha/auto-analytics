import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, LineChart, Line, Cell, Legend,
} from 'recharts';
import { calculateScore, formatPrice, formatMileage } from './utils/scoreCalculator';
import { calcAnnualMileage, formatAnnual } from './utils/usage';
import rawData from '../data/cars.json';

const COLORS = ['#48b803', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#FF5722', '#607D8B'];

function listingUrlFromCarUrl(carUrl) {
  if (!carUrl) return null;
  return carUrl.replace(/\/[^/]+\/$/, '/');
}

function DealCard({ car }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = car.image && !imgFailed;

  return (
    <div className={`deal-card ${car.score > 20 ? 'great' : car.score > 10 ? 'good' : ''}`}>
      <div className="deal-score">
        <span className={`score-badge ${car.score > 20 ? 'great' : car.score > 10 ? 'good' : ''}`}>
          {car.score > 0 ? '+' : ''}{car.score}
        </span>
        <span className="score-label">{car.scoreLabel}</span>
      </div>
      <div className="deal-image-wrapper">
        {showImage ? (
          <img
            src={car.image}
            alt={`${car.brand} ${car.model}`}
            className="deal-image"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="deal-image-placeholder">
            <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#bbb" strokeWidth="1.5" aria-hidden="true">
              <path d="M5 17h14M5 17l2-5h10l2 5M7 12V7a1 1 0 011-1h8a1 1 0 011 1v5" />
              <circle cx="7.5" cy="14.5" r="1.5" />
              <circle cx="16.5" cy="14.5" r="1.5" />
            </svg>
            <span>{car.brand} {car.model}</span>
          </div>
        )}
      </div>
      <div className="deal-info">
        <h3>{car.brand} {car.model}</h3>
        <p>{car.year} год • {formatMileage(car.mileage)}</p>
        <p>{car.engineVolume} {car.fuelType} / {car.horsepower} л.с.</p>
        <p className="deal-price">{formatPrice(car.price)}</p>
        {car.avgPrice && <p className="deal-avg">Средняя: {formatPrice(car.avgPrice)}</p>}
      </div>
      {car.url && (
        <a href={car.url} target="_blank" rel="noopener noreferrer" className="deal-link">
          Смотреть на сайте →
        </a>
      )}
    </div>
  );
}

function UsageCard({ car }) {
  return (
    <div className="deal-card usage-card">
      <div className="deal-info">
        <span className="annual-badge">{formatAnnual(car.annual)}</span>
        <h3>{car.brand} {car.model}</h3>
        <p>{car.year} год • всего {formatMileage(car.mileage)}</p>
        <p>{car.engineVolume} {car.fuelType} / {car.horsepower} л.с.</p>
        <p className="deal-price">{formatPrice(car.price)}</p>
      </div>
      {car.url && (
        <a href={car.url} target="_blank" rel="noopener noreferrer" className="deal-link">
          Смотреть на сайте →
        </a>
      )}
    </div>
  );
}

function App() {
  const [brandFilter, setBrandFilter] = useState('all');
  const [yearFrom, setYearFrom] = useState('all');
  const [yearTo, setYearTo] = useState('all');
  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [bodyTypeFilter, setBodyTypeFilter] = useState('all');
  const [maxAnnual, setMaxAnnual] = useState(10000);
  const [hiddenBrands, setHiddenBrands] = useState(new Set());

  const cars = useMemo(() => calculateScore(rawData), []);

  const brands = useMemo(() => {
    const b = [...new Set(cars.map(c => c.brand))].sort();
    return b;
  }, [cars]);

  const years = useMemo(() => {
    const y = [...new Set(cars.map(c => c.year).filter(Boolean))].sort((a, b) => b - a);
    return y;
  }, [cars]);

  const baseFiltered = useMemo(() => {
    let result = cars;
    if (brandFilter !== 'all') result = result.filter(c => c.brand === brandFilter);
    if (yearFrom !== 'all') result = result.filter(c => c.year >= parseInt(yearFrom));
    if (yearTo !== 'all') result = result.filter(c => c.year <= parseInt(yearTo));
    if (showDealsOnly) result = result.filter(c => c.score > 10);
    return result;
  }, [cars, brandFilter, yearFrom, yearTo, showDealsOnly]);

  const filtered = useMemo(() => {
    if (bodyTypeFilter === 'all') return baseFiltered;
    return baseFiltered.filter(c => c.bodyType === bodyTypeFilter);
  }, [baseFiltered, bodyTypeFilter]);

  const bodyTypes = useMemo(() => {
    const map = {};
    baseFiltered.forEach(c => {
      if (!c.bodyType) return;
      map[c.bodyType] = (map[c.bodyType] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ru'))
      .map(([bt]) => bt);
  }, [baseFiltered]);

  useEffect(() => {
    if (bodyTypeFilter !== 'all' && !bodyTypes.includes(bodyTypeFilter)) {
      setBodyTypeFilter('all');
    }
  }, [bodyTypes, bodyTypeFilter]);

  const priceByBrand = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
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
  }, [filtered]);

  const scatterData = useMemo(() => {
    const pts = filtered
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
  }, [filtered]);

  const scatterSeries = useMemo(() => {
    const { topBrands, pts } = scatterData;
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
      fill: COLORS[i % COLORS.length],
    }));
    if (other.length > 0) series.push({ brand: 'Другие', data: other, fill: '#9E9E9E' });
    return series.filter(s => !hiddenBrands.has(s.brand));
  }, [scatterData, hiddenBrands]);

  const toggleBrand = (entry) => {
    setHiddenBrands(prev => {
      const next = new Set(prev);
      if (next.has(entry.value)) next.delete(entry.value);
      else next.add(entry.value);
      return next;
    });
  };

  const lowUsageAll = useMemo(() => {
    return filtered
      .map(c => ({ ...c, annual: calcAnnualMileage(c) }))
      .filter(c => c.annual !== null);
  }, [filtered]);

  const lowUsageCars = useMemo(() => {
    return lowUsageAll
      .filter(c => c.annual <= maxAnnual)
      .sort((a, b) => a.annual - b.annual)
      .slice(0, 8);
  }, [lowUsageAll, maxAnnual]);

  const yearVsPrice = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
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
  }, [filtered]);

  const topModels = useMemo(() => {
    const map = {};
    filtered.forEach(c => {
      const key = `${c.brand} ${c.model}`;
      if (!map[key]) map[key] = { name: key, brand: c.brand, model: c.model, count: 0, prices: [], sampleUrl: c.url || null };
      map[key].count++;
      map[key].prices.push(c.price);
    });
    return Object.values(map)
      .map(d => ({
        ...d,
        avgPrice: Math.round(d.prices.reduce((a, b) => a + b, 0) / d.prices.length),
        listingUrl: listingUrlFromCarUrl(d.sampleUrl),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filtered]);

  const bestDeals = useMemo(() => {
    return [...filtered].sort((a, b) => b.score - a.score).slice(0, 5);
  }, [filtered]);

  const avgMileage = useMemo(() => {
    const withMileage = filtered.filter(c => c.mileage != null);
    if (withMileage.length === 0) return null;
    return Math.round(withMileage.reduce((a, c) => a + c.mileage, 0) / withMileage.length);
  }, [filtered]);

  const brandColors = useMemo(() => {
    const map = {};
    brands.forEach((b, i) => { map[b] = COLORS[i % COLORS.length]; });
    return map;
  }, [brands]);

  return (
    <div className="app">
      <header className="header">
        <h1>Major Expert Auto Analytics</h1>
        <p className="subtitle">
          {filtered.length} объявлений • Данные с major-expert.ru
        </p>
      </header>

      <div className="filters">
        <select value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
          <option value="all">Все марки</option>
          {brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        <select value={yearFrom} onChange={e => setYearFrom(e.target.value)}>
          <option value="all">Год от</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={yearTo} onChange={e => setYearTo(e.target.value)}>
          <option value="all">Год до</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>

        <select value={bodyTypeFilter} onChange={e => setBodyTypeFilter(e.target.value)}>
          <option value="all">Все типы кузова</option>
          {bodyTypes.map(bt => <option key={bt} value={bt}>{bt}</option>)}
        </select>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showDealsOnly}
            onChange={e => setShowDealsOnly(e.target.checked)}
          />
          Только выгодные предложения
        </label>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{filtered.length}</div>
          <div className="stat-label">Объявлений</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {filtered.length > 0 ? formatPrice(Math.round(filtered.reduce((a, c) => a + c.price, 0) / filtered.length)) : '—'}
          </div>
          <div className="stat-label">Средняя цена</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {avgMileage != null ? avgMileage.toLocaleString('ru-RU') + ' км' : '—'}
          </div>
          <div className="stat-label">Средний пробег</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{filtered.filter(c => c.score > 10).length}</div>
          <div className="stat-label">Выгодных сделок</div>
        </div>
      </div>

      <div className="charts-grid">
        <div className="chart-card full-width">
          <h2>Средняя цена по маркам (Топ-10)</h2>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={priceByBrand}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="brand" angle={-35} textAnchor="end" height={80} />
              <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => formatPrice(v)} />
              <Bar dataKey="avgPrice">
                {priceByBrand.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2>Пробег vs Цена</h2>
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mileage" name="Пробег" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} type="number" />
              <YAxis
                dataKey="price"
                name="Цена"
                scale="log"
                domain={['auto', 'auto']}
                tickFormatter={v => `${(v / 1000000).toFixed(1)}M`}
                type="number"
              />
              <Tooltip
                formatter={(value, name) => name === 'Цена' ? formatPrice(value) : formatMileage(value)}
                labelFormatter={(_, payload) => {
                  const p = payload[0]?.payload;
                  if (!p) return '';
                  return p.annual ? `${p.name} • ${formatAnnual(p.annual)}` : p.name;
                }}
              />
              <Legend onClick={toggleBrand} />
              {scatterSeries.map(s => (
                <Scatter key={s.brand} name={s.brand} data={s.data} fill={s.fill} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
          <p className="chart-hint">Нажмите на марку в легенде, чтобы скрыть/показать её точки</p>
        </div>

        <div className="chart-card">
          <h2>Год выпуска vs Средняя цена</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={yearVsPrice}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={v => formatPrice(v)} />
              <Line type="monotone" dataKey="avgPrice" stroke="#2196F3" strokeWidth={2} dot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card full-width">
          <h2>Топ-10 популярных моделей</h2>
          <div className="tiles-grid">
            {topModels.map((m, i) => {
              const Tag = m.listingUrl ? 'a' : 'div';
              const linkProps = m.listingUrl
                ? { href: m.listingUrl, target: '_blank', rel: 'noopener noreferrer' }
                : {};
              return (
                <Tag key={m.name} className="tile-card" {...linkProps}>
                  <div className="tile-accent">
                    <div
                      className="tile-accent-fill"
                      style={{ width: `${(m.count / topModels[0].count) * 100}%`, background: COLORS[i % COLORS.length] }}
                    />
                  </div>
                  <div className="tile-content">
                    <div className="tile-name">{m.name}</div>
                    <div className="tile-count">{m.count} объяв.</div>
                    <div className="tile-price">{formatPrice(m.avgPrice)}</div>
                  </div>
                </Tag>
              );
            })}
          </div>
        </div>
      </div>

      <div className="deals-section">
        <div className="section-header">
          <h2>
            Малоездные авто
            <span className="count-badge">{lowUsageAll.filter(c => c.annual <= maxAnnual).length}</span>
          </h2>
          <label className="slider-label">
            Пробег в год до <strong>{formatAnnual(maxAnnual)}</strong>
            <input
              type="range"
              min="5000"
              max="20000"
              step="500"
              value={maxAnnual}
              onChange={e => setMaxAnnual(Number(e.target.value))}
            />
          </label>
        </div>
        {lowUsageCars.length === 0 ? (
          <p className="empty-note">Нет авто с таким годовым пробегом — увеличьте порог</p>
        ) : (
          <div className="deals-grid">
            {lowUsageCars.map(car => (
              <UsageCard key={car.id} car={car} />
            ))}
          </div>
        )}
      </div>

      <div className="deals-section">
        <h2>Лучшие предложения (Score выгодности)</h2>
        <div className="deals-grid">
          {bestDeals.map(car => (
            <DealCard key={car.id} car={car} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;

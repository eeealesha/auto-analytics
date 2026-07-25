import React, { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, LineChart, Line, Cell,
} from 'recharts';
import { calculateScore, formatPrice, formatMileage } from './utils/scoreCalculator';
import rawData from '../data/cars.json';

const COLORS = ['#48b803', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#FF5722', '#607D8B'];

function listingUrlFromCarUrl(carUrl) {
  if (!carUrl) return null;
  return carUrl.replace(/\/[^/]+\/$/, '/');
}

function App() {
  const [brandFilter, setBrandFilter] = useState('all');
  const [yearFrom, setYearFrom] = useState('all');
  const [yearTo, setYearTo] = useState('all');
  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [bodyTypeFilter, setBodyTypeFilter] = useState('all');

  const cars = useMemo(() => calculateScore(rawData), []);

  const brands = useMemo(() => {
    const b = [...new Set(cars.map(c => c.brand))].sort();
    return b;
  }, [cars]);

  const years = useMemo(() => {
    const y = [...new Set(cars.map(c => c.year).filter(Boolean))].sort((a, b) => b - a);
    return y;
  }, [cars]);

  const bodyTypes = useMemo(() => {
    const b = [...new Set(cars.map(c => c.bodyType).filter(Boolean))].sort();
    return b;
  }, [cars]);

  const filtered = useMemo(() => {
    let result = cars;
    if (brandFilter !== 'all') result = result.filter(c => c.brand === brandFilter);
    if (yearFrom !== 'all') result = result.filter(c => c.year >= parseInt(yearFrom));
    if (yearTo !== 'all') result = result.filter(c => c.year <= parseInt(yearTo));
    if (bodyTypeFilter !== 'all') result = result.filter(c => c.bodyType === bodyTypeFilter);
    if (showDealsOnly) result = result.filter(c => c.score > 10);
    return result;
  }, [cars, brandFilter, yearFrom, yearTo, bodyTypeFilter, showDealsOnly]);

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

  const mileageVsPrice = useMemo(() => {
    return filtered
      .filter(c => c.mileage && c.mileage > 100 && c.mileage < 500000)
      .map(c => ({
        mileage: c.mileage,
        price: c.price,
        name: `${c.brand} ${c.model}`,
        brand: c.brand,
      }));
  }, [filtered]);

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

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={showDealsOnly}
            onChange={e => setShowDealsOnly(e.target.checked)}
          />
          Только выгодные предложения
        </label>
      </div>

      <div className="body-chips">
        <button
          className={`chip ${bodyTypeFilter === 'all' ? 'active' : ''}`}
          onClick={() => setBodyTypeFilter('all')}
        >
          Все типы
        </button>
        {bodyTypes.map(bt => (
          <button
            key={bt}
            className={`chip ${bodyTypeFilter === bt ? 'active' : ''}`}
            onClick={() => setBodyTypeFilter(bt)}
          >
            {bt}
          </button>
        ))}
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
            {(() => {
              const withMileage = filtered.filter(c => c.mileage);
              return withMileage.length > 0
                ? Math.round(withMileage.reduce((a, c) => a + c.mileage, 0) / withMileage.length).toLocaleString('ru-RU') + ' км'
                : '—';
            })()}
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
              <XAxis dataKey="mileage" name="Пробег" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <YAxis dataKey="price" name="Цена" tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip
                formatter={(value, name) => name === 'Цена' ? formatPrice(value) : formatMileage(value)}
                labelFormatter={(_, payload) => payload[0]?.payload?.name || ''}
              />
              <Scatter data={mileageVsPrice} fill="#48b803" />
            </ScatterChart>
          </ResponsiveContainer>
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
                  <div className="tile-accent" style={{ background: COLORS[i % COLORS.length] }} />
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
        <h2>Лучшие предложения (Score выгодности)</h2>
        <div className="deals-grid">
          {bestDeals.map(car => (
            <div key={car.id} className={`deal-card ${car.score > 20 ? 'great' : car.score > 10 ? 'good' : ''}`}>
              <div className="deal-score">
                <span className={`score-badge ${car.score > 20 ? 'great' : car.score > 10 ? 'good' : ''}`}>
                  {car.score > 0 ? '+' : ''}{car.score}
                </span>
                <span className="score-label">{car.scoreLabel}</span>
              </div>
              <div className="deal-image-wrapper">
                {car.image ? (
                  <img
                    src={car.image}
                    alt={`${car.brand} ${car.model}`}
                    className="deal-image"
                    onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                  />
                ) : null}
                <div className="deal-image-placeholder" style={{ display: car.image ? 'none' : 'flex' }}>
                  <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#bbb" strokeWidth="1.5">
                    <path d="M5 17h14M5 17l2-5h10l2 5M7 12V7a1 1 0 011-1h8a1 1 0 011 1v5" />
                    <circle cx="7.5" cy="14.5" r="1.5" />
                    <circle cx="16.5" cy="14.5" r="1.5" />
                  </svg>
                  <span>{car.brand} {car.model}</span>
                </div>
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
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;

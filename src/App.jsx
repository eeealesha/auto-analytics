import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, LineChart, Line, Cell, Legend, Customized,
} from 'recharts';
import { calculateScore, formatPrice, formatMileage, getCarClass } from './utils/scoreCalculator';
import { calcAnnualMileage, formatAnnual } from './utils/usage';
import { getDefaultThresholds } from './utils/segmentation';
import { linearRegression } from './utils/trendLine';
import { thinSeries } from './utils/thinPoints.js';
import { getSupplierConfig } from './utils/brandAssets.jsx';
import {
  applyBaseFilters,
  applySegmentFilters,
  computeBodyTypes,
  computePriceByBrand,
  computeScatterData,
  computeScatterSeries,
  computeLowUsage,
  computeYearVsPrice,
  computeTopModels,
  getBestDeals,
  computeAvgMileage,
} from './utils/filterPipeline';
import SegmentFilter from './components/SegmentFilter';
import PriceHistoryChart from './components/PriceHistoryChart';
import SourceComparison from './components/SourceComparison.jsx';
import CarCard from './components/CarCard';
import FilterBar from './components/FilterBar';

const COLORS = ['#1E293B', '#334155', '#DC2626', '#2563EB', '#059669', '#D97706', '#7C3AED', '#0891B2'];

const SOURCE_LABELS = { 'major-expert': 'Major Auto', rolf: 'Рольф' };

function TrendLines({ scatterSeries, hiddenBrands, xAxisMap, yAxisMap }) {
  const xScale = xAxisMap && Object.values(xAxisMap)[0]?.scale
  const yScale = yAxisMap && Object.values(yAxisMap)[0]?.scale
  if (!xScale || !yScale) return null

  return (
    <g>
      {scatterSeries.map(s => {
        if (hiddenBrands.has(s.brand) || s.data.length < 2) return null
        const points = s.data.map(p => ({ x: p.mileage, y: p.price }))
        const { slope, intercept } = linearRegression(points)
        const xMin = Math.min(...s.data.map(p => p.mileage))
        const xMax = Math.max(...s.data.map(p => p.mileage))
        const y1 = slope * xMin + intercept
        const y2 = slope * xMax + intercept
        return (
          <line
            key={`trend-${s.brand}`}
            x1={xScale(xMin)}
            y1={yScale(y1)}
            x2={xScale(xMax)}
            y2={yScale(y2)}
            stroke={s.fill}
            strokeWidth={2}
            strokeDasharray="5 5"
            opacity={0.7}
          />
        )
      })}
    </g>
  )
}

function listingUrlFromCarUrl(carUrl) {
  if (!carUrl) return null;
  return carUrl.replace(/\/[^/]+\/$/, '/');
}

function ScoreBadge({ score }) {
  if (score <= 0) return null;
  const tier = score > 20 ? 'great' : 'good';
  return <div className={`deal-score-badge ${tier}`}>+{score}</div>;
}

function DealCard({ car }) {
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = car.image && !imgFailed;
  const supplier = getSupplierConfig(car.source);

  return (
    <div className={`deal-card ${car.score > 20 ? 'great' : car.score > 10 ? 'good' : ''}`}>
      <div
        className="deal-supplier-badge"
        style={{ backgroundColor: supplier.bgColor, color: supplier.textColor }}
      >
        {SOURCE_LABELS[car.source] || car.source}
      </div>
      <div className="deal-content">
        <div className="deal-image-wrap">
          {showImage ? (
            <img
              src={car.image}
              alt={`${car.brand} ${car.model}`}
              className="deal-image"
              loading="lazy"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <div className="deal-image-placeholder">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="4" y="14" width="40" height="16" rx="4" stroke="#94A3B8" strokeWidth="2" fill="none"/>
                <circle cx="14" cy="32" r="5" stroke="#94A3B8" strokeWidth="2" fill="none"/>
                <circle cx="34" cy="32" r="5" stroke="#94A3B8" strokeWidth="2" fill="none"/>
              </svg>
            </div>
          )}
        </div>
        <div className="deal-info">
          <h3>{car.brand} {car.model}</h3>
          <p className="deal-meta">{car.year} год • {formatMileage(car.mileage)} • {getCarClass(car)}</p>
          <p className="deal-specs">
            {car.horsepower ? `${car.horsepower} л.с.` : ''}
            {car.engineVolume ? ` • ${car.engineVolume}L` : ''}
            {car.driveType ? ` • ${car.driveType}` : ''}
          </p>
          <div className="deal-price-row">
            <span className="deal-price">{formatPrice(car.price)}</span>
            {car.avgPrice && <span className="deal-avg">Рынок: {formatPrice(car.avgPrice)}</span>}
          </div>
        </div>
        <div className="deal-score-col">
          <ScoreBadge score={car.score} />
        </div>
      </div>
      {car.url && (
        <a href={car.url} target="_blank" rel="noopener noreferrer" className="deal-link">
          Смотреть →
        </a>
      )}
    </div>
  );
}

function UsageCard({ car }) {
  const supplier = getSupplierConfig(car.source);
  return (
    <div className="deal-card usage-card">
      <div
        className="deal-supplier-badge"
        style={{ backgroundColor: supplier.bgColor, color: supplier.textColor }}
      >
        {SOURCE_LABELS[car.source] || car.source}
      </div>
      <div className="deal-content">
        <div className="deal-info">
          <span className="annual-badge">{formatAnnual(car.annual)}</span>
          <h3>{car.brand} {car.model}</h3>
          <p className="deal-meta">{car.year} год • всего {formatMileage(car.mileage)}</p>
          <p className="deal-specs">
            {car.horsepower ? `${car.horsepower} л.с.` : ''}
            {car.engineVolume ? ` • ${car.engineVolume}L` : ''}
          </p>
          <div className="deal-price-row">
            <span className="deal-price">{formatPrice(car.price)}</span>
          </div>
        </div>
      </div>
      {car.url && (
        <a href={car.url} target="_blank" rel="noopener noreferrer" className="deal-link">
          Смотреть →
        </a>
      )}
    </div>
  );
}

function App() {
  const [brandFilter, setBrandFilter] = useState('all');
  const [yearFrom, setYearFrom] = useState('all');
  const [yearTo, setYearTo] = useState('all');
  const [classFilter, setClassFilter] = useState('all');
  const [priceRange, setPriceRange] = useState(null);
  const [showDealsOnly, setShowDealsOnly] = useState(false);
  const [bodyTypeFilter, setBodyTypeFilter] = useState('all');
  const [maxAnnual, setMaxAnnual] = useState(10000);
  const [hiddenBrands, setHiddenBrands] = useState(new Set());
  const [selectedSegment, setSelectedSegment] = useState('all');
  const [thresholds, setThresholds] = useState(getDefaultThresholds());
  const [historyData, setHistoryData] = useState(new Map());
  const [historyDates, setHistoryDates] = useState([]);
  const [rawCars, setRawCars] = useState(null);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [metaSources, setMetaSources] = useState([]);
  const [apiError, setApiError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // Ответ с кодом 4xx/5xx тоже успешно парсится как JSON, поэтому res.ok
    // проверяем отдельно: иначе тело {error:'...'} уедет в rawCars вместо массива.
    async function readJson(res, label) {
      if (!res.ok) throw new Error(`${label}: HTTP ${res.status}`);
      return res.json();
    }

    async function loadData() {
      try {
        const [offersRes, historyRes, metaRes] = await Promise.all([
          fetch('/api/offers'),
          fetch('/api/history' + (sourceFilter !== 'all' ? `?source=${encodeURIComponent(sourceFilter)}` : '')),
          fetch('/api/meta'),
        ]);
        const nextOffers = await readJson(offersRes, '/api/offers');
        const history = await readJson(historyRes, '/api/history');
        const meta = await readJson(metaRes, '/api/meta');
        if (!Array.isArray(nextOffers)) throw new Error('/api/offers вернул не массив');
        if (cancelled) return;

        setApiError(null);
        setRawCars(nextOffers);
        setMetaSources(meta?.sources || []);

        const dates = history?.dates || [];
        const byDate = history?.byDate || {};
        const data = new Map(dates.map(d => [d, byDate[d] || []]));
        setHistoryDates(dates);
        setHistoryData(data);
      } catch (e) {
        if (cancelled) return;
        console.warn('API недоступен:', e);
        setApiError(e.message || String(e));
        setRawCars([]);
        setMetaSources([]);
        setHistoryDates([]);
        setHistoryData(new Map());
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, [sourceFilter]);

  const cars = useMemo(() => calculateScore(rawCars || []), [rawCars]);

  const brands = useMemo(() => {
    return [...new Set(cars.map(c => c.brand))].sort();
  }, [cars]);

  const carClasses = useMemo(() => {
    const classes = new Set();
    cars.forEach(c => {
      const cls = getCarClass(c);
      if (cls) classes.add(cls);
    });
    return [...classes].sort();
  }, [cars]);

  const maxPrice = useMemo(() => {
    if (cars.length === 0) return 30000000;
    return Math.ceil(Math.max(...cars.map(c => c.price)) / 100000) * 100000;
  }, [cars]);

  const baseFiltered = useMemo(() => applyBaseFilters(cars, {
    source: sourceFilter,
    brand: brandFilter,
    yearFrom,
    yearTo,
    carClass: classFilter,
    priceRange,
    showDealsOnly,
  }), [cars, sourceFilter, brandFilter, yearFrom, yearTo, classFilter, priceRange, showDealsOnly]);

  const segmentedCars = useMemo(() => applySegmentFilters(baseFiltered, {
    segment: selectedSegment,
    thresholds,
    bodyType: bodyTypeFilter,
  }), [baseFiltered, selectedSegment, thresholds, bodyTypeFilter]);

  const bodyTypes = useMemo(() => computeBodyTypes(baseFiltered), [baseFiltered]);

  useEffect(() => {
    if (bodyTypeFilter !== 'all' && !bodyTypes.includes(bodyTypeFilter)) {
      setBodyTypeFilter('all');
    }
  }, [bodyTypes, bodyTypeFilter]);

  useEffect(() => {
    if (sourceFilter !== 'all' && !metaSources.includes(sourceFilter)) {
      setSourceFilter('all');
    }
  }, [metaSources, sourceFilter]);

  const sourceStats = useMemo(() => {
    const stats = {};
    segmentedCars.forEach(c => {
      const src = c.source || 'unknown';
      if (!stats[src]) stats[src] = { count: 0, total: 0 };
      stats[src].count++;
      stats[src].total += c.price;
    });
    Object.keys(stats).forEach(s => {
      stats[s].avgPrice = stats[s].count > 0 ? Math.round(stats[s].total / stats[s].count) : 0;
    });
    return stats;
  }, [segmentedCars]);

  const comparisonPairs = useMemo(() => {
    const sources = metaSources.length > 0 ? metaSources : ['major-expert', 'rolf'];
    if (sources.length < 2) return [];

    const bySource = {};
    sources.forEach(s => { bySource[s] = segmentedCars.filter(c => c.source === s); });

    const pairs = [];
    const matchedIds = new Set();
    const primary = bySource[sources[0]] || [];
    const secondary = bySource[sources[1]] || [];

    primary.forEach(carA => {
      const match = secondary.find(carB =>
        carA.brand === carB.brand && carA.model === carB.model && !matchedIds.has(carB.id)
      );
      if (match) {
        pairs.push({ carA, carB: match });
        matchedIds.add(match.id);
      }
    });

    return pairs.slice(0, 6);
  }, [segmentedCars, metaSources]);

  const priceByBrand = useMemo(() => computePriceByBrand(segmentedCars), [segmentedCars]);

  const scatterData = useMemo(() => computeScatterData(segmentedCars), [segmentedCars]);

  const scatterSeries = useMemo(() => computeScatterSeries(scatterData, COLORS), [scatterData]);

  const scatterSeriesLimited = useMemo(() => thinSeries(scatterSeries, 2000), [scatterSeries]);

  const toggleBrand = (entry) => {
    setHiddenBrands(prev => {
      const next = new Set(prev);
      if (next.has(entry.value)) next.delete(entry.value);
      else next.add(entry.value);
      return next;
    });
  };

  const lowUsageAll = useMemo(() => {
    return segmentedCars
      .map(c => ({ ...c, annual: calcAnnualMileage(c) }))
      .filter(c => c.annual !== null);
  }, [segmentedCars]);

  const lowUsageCars = useMemo(() => computeLowUsage(segmentedCars, maxAnnual), [segmentedCars, maxAnnual]);

  const yearVsPrice = useMemo(() => computeYearVsPrice(segmentedCars), [segmentedCars]);

  const topModels = useMemo(() => computeTopModels(segmentedCars), [segmentedCars]);

  const bestDeals = useMemo(() => getBestDeals(segmentedCars), [segmentedCars]);

  const avgMileage = useMemo(() => computeAvgMileage(segmentedCars), [segmentedCars]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-brand">
            <div className="header-icon">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="12" width="28" height="10" rx="4" fill="currentColor" opacity="0.2"/>
                <path d="M6 18 L8 12 L24 12 L26 18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
                <circle cx="10" cy="22" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
                <circle cx="22" cy="22" r="3" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            </div>
            <div>
              <h1>Auto Analytics</h1>
              <p className="header-subtitle">
                {rawCars === null ? 'Загрузка данных…' : `${segmentedCars.length} объявлений`}
              </p>
            </div>
          </div>
          <div className="header-stats">
            <div className="header-stat">
              <span className="stat-number">{segmentedCars.length}</span>
              <span className="stat-unit">авто</span>
            </div>
            <div className="header-divider" />
            <div className="header-stat">
              <span className="stat-number">{metaSources.length || 1}</span>
              <span className="stat-unit">{metaSources.length === 1 ? 'источник' : 'источника'}</span>
            </div>
          </div>
        </div>
      </header>

      {apiError && (
        <p className="api-error" role="alert">
          Не удалось загрузить данные с сервера ({apiError}). Показан пустой дашборд — обновите страницу позже.
        </p>
      )}

      <FilterBar
        brandFilter={brandFilter}
        setBrandFilter={setBrandFilter}
        brands={brands}
        yearFrom={yearFrom}
        setYearFrom={setYearFrom}
        yearTo={yearTo}
        setYearTo={setYearTo}
        classFilter={classFilter}
        setClassFilter={setClassFilter}
        carClasses={carClasses}
        priceRange={priceRange}
        setPriceRange={setPriceRange}
        maxPrice={maxPrice}
        showDealsOnly={showDealsOnly}
        setShowDealsOnly={setShowDealsOnly}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        sources={metaSources}
        filteredCount={segmentedCars.length}
        totalCount={cars.length}
      />

      <div className="secondary-filters">
        <SegmentFilter
          selectedSegment={selectedSegment}
          onSegmentChange={setSelectedSegment}
          economyMax={thresholds.economyMax}
          luxuryMin={thresholds.luxuryMin}
          onThresholdsChange={setThresholds}
          bodyType={bodyTypeFilter}
          onBodyTypeChange={setBodyTypeFilter}
          bodyTypes={bodyTypes}
        />
        <div className="annual-slider">
          <label>
            Пробег в год до <strong>{formatAnnual(maxAnnual)}</strong>
            <input
              type="range"
              aria-label="Пробег в год"
              min="5000"
              max="20000"
              step="500"
              value={maxAnnual}
              onChange={e => setMaxAnnual(Number(e.target.value))}
            />
          </label>
        </div>
      </div>

      {metaSources.length > 0 && (
        <div className="source-compare">
          {metaSources.map(source => {
            const cfg = getSupplierConfig(source);
            const stat = sourceStats[source];
            return (
              <div key={source} className="source-card" style={{ borderLeftColor: cfg.borderColor }}>
                <div className="source-name" style={{ color: cfg.textColor }}>{SOURCE_LABELS[source] || source}</div>
                <div className="source-count">{stat?.count || 0} объявлений</div>
                {stat?.avgPrice > 0 && (
                  <div className="source-price">Средняя: {formatPrice(stat.avgPrice)}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {comparisonPairs.length > 0 && (
        <section className="comparison-section">
          <h2 className="section-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="18" rx="2"/>
              <path d="M12 3v18M2 12h20"/>
            </svg>
            Сравнение по моделям
          </h2>
          <div className="comparison-grid">
            {comparisonPairs.map((pair, i) => (
              <CarCard key={i} carA={pair.carA} carB={pair.carB} />
            ))}
          </div>
        </section>
      )}

      <div className="charts-grid">
        <div className="chart-card">
          <h2 className="chart-title">Средняя цена по маркам</h2>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={priceByBrand}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="brand" angle={-35} textAnchor="end" height={80} tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={v => formatPrice(v)}
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              />
              <Bar dataKey="avgPrice" radius={[4, 4, 0, 0]}>
                {priceByBrand.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2 className="chart-title">Пробег vs Цена</h2>
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="mileage" name="Пробег" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} type="number" tick={{ fontSize: 12 }} />
              <YAxis
                dataKey="price"
                name="Цена"
                scale="log"
                domain={['auto', 'auto']}
                tickFormatter={v => `${(v / 1000000).toFixed(1)}M`}
                type="number"
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value, name) => name === 'Цена' ? formatPrice(value) : formatMileage(value)}
                labelFormatter={(_, payload) => {
                  const p = payload[0]?.payload;
                  if (!p) return '';
                  return p.annual ? `${p.name} • ${formatAnnual(p.annual)}` : p.name;
                }}
                contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
              />
              <Legend onClick={toggleBrand} />
              <Customized
                component={<TrendLines scatterSeries={scatterSeriesLimited} hiddenBrands={hiddenBrands} />}
              />
              {scatterSeriesLimited.map(s => (
                <Scatter
                  key={s.brand}
                  name={s.brand}
                  data={s.data}
                  fill={s.fill}
                  hide={hiddenBrands.has(s.brand)}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
          <p className="chart-hint">Нажмите на марку в легенде, чтобы скрыть/показать её точки</p>
        </div>

        <div className="chart-card">
          <h2 className="chart-title">Динамика цен по годам</h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={yearVsPrice}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => formatPrice(v)} contentStyle={{ borderRadius: 8, border: '1px solid #E2E8F0' }} />
              <Line type="monotone" dataKey="avgPrice" stroke="#DC2626" strokeWidth={2.5} dot={{ r: 4, fill: '#DC2626' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h2 className="chart-title">Топ-10 моделей</h2>
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
        <PriceHistoryChart
          historyDates={historyDates}
          historyData={historyData}
          selectedSegment={selectedSegment}
          thresholds={thresholds}
          selectedBrand="all"
        />
      </div>

      <section className="deals-section">
        <h2 className="section-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 17h2v-4H3m4 4h2V9H7m4 8h2V5h-2m4 12h2v-7h-2m4 7h2V7h-2" />
          </svg>
          Малоездные авто
          <span className="count-badge">{lowUsageAll.filter(c => c.annual <= maxAnnual).length}</span>
        </h2>
        {lowUsageCars.length === 0 ? (
          <p className="empty-note">Нет авто с таким годовым пробегом — увеличьте порог</p>
        ) : (
          <div className="deals-list">
            {lowUsageCars.map(car => (
              <UsageCard key={car.id} car={car} />
            ))}
          </div>
        )}
      </section>

      <section className="deals-section">
        <h2 className="section-title">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          Лучшие предложения
        </h2>
        <div className="deals-list">
          {bestDeals.map(car => (
            <DealCard key={car.id} car={car} />
          ))}
        </div>
      </section>

      <SourceComparison cars={segmentedCars} sources={metaSources} />

      <footer className="footer">
        <p>Auto Analytics • {metaSources.map(s => SOURCE_LABELS[s] || s).join(', ') || 'данные загружаются'}</p>
      </footer>
    </div>
  );
}

export default App;

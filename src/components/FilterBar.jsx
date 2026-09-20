import React from 'react';

const SOURCE_LABELS = { 'major-expert': 'Major Auto', rolf: 'Рольф' };

export default function FilterBar({
  brandFilter,
  setBrandFilter,
  brands,
  yearFrom,
  setYearFrom,
  yearTo,
  setYearTo,
  classFilter,
  setClassFilter,
  carClasses,
  priceRange,
  setPriceRange,
  maxPrice,
  showDealsOnly,
  setShowDealsOnly,
  sourceFilter,
  setSourceFilter,
  sources = [],
  filteredCount,
  totalCount,
}) {
  return (
    <div className="filter-bar">
      <div className="filter-bar-inner">
        <div className="filter-bar-header">
          <h2 className="filter-bar-title">Фильтры</h2>
          <span className="filter-bar-count">{filteredCount} из {totalCount}</span>
        </div>

        <div className="filter-bar-controls">
          <div className="filter-group">
            <label className="filter-label" htmlFor="filter-brand">Марка</label>
            <select
              id="filter-brand"
              aria-label="Марка"
              className="filter-select"
              value={brandFilter}
              onChange={e => setBrandFilter(e.target.value)}
            >
              <option value="all">Все марки</option>
              {brands.map(b => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label" htmlFor="filter-class">Класс</label>
            <select
              id="filter-class"
              aria-label="Класс"
              className="filter-select"
              value={classFilter}
              onChange={e => setClassFilter(e.target.value)}
            >
              <option value="all">Все классы</option>
              {carClasses.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label" htmlFor="filter-year-from">Год от</label>
            <select
              id="filter-year-from"
              aria-label="Год от"
              className="filter-select"
              value={yearFrom}
              onChange={e => setYearFrom(e.target.value)}
            >
              <option value="all">Любой</option>
              {yearsRange()}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label" htmlFor="filter-year-to">Год до</label>
            <select
              id="filter-year-to"
              aria-label="Год до"
              className="filter-select"
              value={yearTo}
              onChange={e => setYearTo(e.target.value)}
            >
              <option value="all">Любой</option>
              {yearsRange()}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label" htmlFor="filter-price">
              Цена до: {priceRange ? `${(priceRange / 1000000).toFixed(1)}M ₽` : 'Любая'}
            </label>
            <input
              id="filter-price"
              aria-label="Цена до"
              type="range"
              className="filter-range"
              min={0}
              max={maxPrice}
              step={100000}
              value={priceRange || maxPrice}
              onChange={e => setPriceRange(e.target.value === maxPrice ? null : parseInt(e.target.value))}
            />
          </div>

          <div className="filter-group">
            <label className="filter-label" htmlFor="filter-source">Источник</label>
            <select
              id="filter-source"
              aria-label="Источник"
              className="filter-select"
              value={sourceFilter}
              onChange={e => setSourceFilter(e.target.value)}
            >
              <option value="all">Все источники</option>
              {sources.map(s => (
                <option key={s} value={s}>{SOURCE_LABELS[s] || s}</option>
              ))}
            </select>
          </div>

          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showDealsOnly}
              onChange={e => setShowDealsOnly(e.target.checked)}
            />
            <span className="checkbox-custom" />
            <span>Только выгодные</span>
          </label>
        </div>
      </div>
    </div>
  );
}

function yearsRange() {
  const now = new Date().getFullYear() + 1;
  const from = 2014;
  return Array.from({ length: now - from + 1 }, (_, i) => now - i).map(y => (
    <option key={y} value={y}>{y}</option>
  ));
}

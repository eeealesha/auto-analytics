import React, { useMemo } from 'react';
import { findMatches } from '../utils/matchCars.js';
import { formatPrice, formatMileage } from '../utils/scoreCalculator.js';

const SOURCE_LABELS = { 'major-expert': 'major-expert.ru', rolf: 'rolf.ru' };

const FIELDS = [
  { key: 'price', label: 'Цена', format: v => formatPrice(v) },
  { key: 'mileage', label: 'Пробег', format: v => formatMileage(v) },
  { key: 'year', label: 'Год' },
  { key: 'engineVolume', label: 'Объём', format: v => v == null ? null : `${v} л` },
  { key: 'horsepower', label: 'Мощность', format: v => v == null ? null : `${v} л.с.` },
  { key: 'transmission', label: 'КПП' },
  { key: 'driveType', label: 'Привод' },
  { key: 'color', label: 'Цвет' },
  { key: 'owners', label: 'Владельцы' },
];

function highlightClass(name, a, b) {
  if (a == null || b == null) return '';
  if (name === 'price') return a < b ? 'cmp-hl' : '';
  if (name === 'mileage') return a < b ? 'cmp-hl' : '';
  return '';
}

export default function SourceComparison({ cars, sources }) {
  const pairs = useMemo(() => findMatches(cars), [cars]);

  if (pairs.length === 0) {
    return (
      <div className="deals-section">
        <h2>Сравнение источников</h2>
        <p className="empty-note">Нет авто, встречающихся на обоих источниках</p>
      </div>
    );
  }

  return (
    <div className="deals-section">
      <div className="section-header">
        <h2>Сравнение источников <span className="count-badge">{pairs.length}</span></h2>
      </div>
      <div className="comparison-list">
        {pairs.map(pair => (
          <div key={pair.key} className="comparison-row">
            {sources.map(source => {
              const car = pair.carsBySource[source];
              if (!car) return null;
              return (
                <div key={source} className="comparison-col">
                  <h4>{SOURCE_LABELS[source] || source}</h4>
                  <p className="cmp-name">{car.brand} {car.model} · {car.year}</p>
                  {pair.countsBySource?.[source] > 1 && (
                    <p className="cmp-count">лучшее из {pair.countsBySource[source]} объявлений</p>
                  )}
                  <table className="cmp-table">
                    <tbody>
                      {FIELDS.map(f => {
                        const other = sources.map(s => pair.carsBySource[s]?.[f.key]).find(v => v != null && v !== car[f.key]);
                        const value = car[f.key];
                        return (
                          <tr key={f.key} className={highlightClass(f.key, value, other)}>
                            <td>{f.label}</td>
                            <td>{value == null ? '—' : (f.format ? f.format(value) : String(value))}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {car.url && <a href={car.url} target="_blank" rel="noopener noreferrer">Смотреть на сайте →</a>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

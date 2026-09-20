import React, { useState } from 'react';
import { formatPrice, formatMileage, getCarClass, getHorsepowerTier } from '../utils/scoreCalculator';
import { getBrandLogo, getSupplierConfig } from '../utils/brandAssets.jsx';

const CAR_PLACEHOLDER = (
  <svg viewBox="0 0 400 240" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="240" fill="#F1F5F9" rx="12"/>
    <g transform="translate(120, 60)" opacity="0.3">
      <path d="M20 80 Q40 20 80 20 L120 20 Q160 20 160 80 L160 100 L20 100 Z" fill="#94A3B8" stroke="#64748B" strokeWidth="2"/>
      <circle cx="50" cy="105" r="18" fill="#64748B"/>
      <circle cx="50" cy="105" r="10" fill="#94A3B8"/>
      <circle cx="130" cy="105" r="18" fill="#64748B"/>
      <circle cx="130" cy="105" r="10" fill="#94A3B8"/>
      <rect x="30" y="40" width="50" height="25" rx="4" fill="#CBD5E1"/>
      <rect x="100" y="40" width="50" height="25" rx="4" fill="#CBD5E1"/>
    </g>
    <text x="200" y="200" textAnchor="middle" fontSize="12" fill="#94A3B8" fontFamily="sans-serif">Фото не доступно</text>
  </svg>
);

function ScoreBadge({ score, scoreLabel }) {
  if (score <= 0) return null;
  const tier = score > 20 ? 'great' : 'good';
  return (
    <div className={`score-badge ${tier}`}>
      <span className="score-value">+{score}</span>
      <span className="score-text">{scoreLabel}</span>
    </div>
  );
}

function CarSpecs({ car }) {
  const carClass = getCarClass(car);
  const hpTier = getHorsepowerTier(car.horsepower);

  return (
    <div className="car-specs">
      <div className="spec-row">
        <span className="spec-label">Класс</span>
        <span className="spec-value">{carClass}</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">Мощность</span>
        <span className="spec-value">{car.horsepower ? `${car.horsepower} л.с.` : '—'}</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">Уровень</span>
        <span className="spec-value">{hpTier}</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">Привод</span>
        <span className="spec-value">{car.driveType || '—'}</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">КПП</span>
        <span className="spec-value">{car.transmission ? car.transmission.split('(')[0].trim() : '—'}</span>
      </div>
      <div className="spec-row">
        <span className="spec-label">Двигатель</span>
        <span className="spec-value">{car.engineVolume ? `${car.engineVolume}L ${car.fuelType || ''}` : '—'}</span>
      </div>
    </div>
  );
}

function CarSide({ car, isFlipped }) {
  const supplier = getSupplierConfig(car.source);
  const brandLogo = getBrandLogo(car.brand);
  const priceDiff = car.avgPrice ? Math.round((car.avgPrice - car.price) / car.avgPrice * 100) : 0;

  return (
    <div className="car-side">
      <div className="car-header">
        <div className="brand-logo" style={{ color: supplier.color }}>
          {brandLogo}
        </div>
        <div className="supplier-badge" style={{
          backgroundColor: supplier.bgColor,
          color: supplier.textColor,
          borderColor: supplier.borderColor,
        }}>
          {supplier.name}
        </div>
      </div>

      <div className="car-image-container">
        {car.image ? (
          <img
            src={car.image}
            alt={`${car.brand} ${car.model}`}
            className="car-image"
            loading="lazy"
            onError={(e) => {
              e.target.style.display = 'none';
              e.target.nextElementSibling.style.display = 'block';
            }}
          />
        ) : null}
        <div className="car-placeholder" style={{ display: car.image ? 'none' : 'block' }}>
          {CAR_PLACEHOLDER}
        </div>
      </div>

      <div className="car-identity">
        <h3 className="car-title">{car.brand} {car.model}</h3>
        <p className="car-subtitle">
          {car.year} • {formatMileage(car.mileage)} • {car.color || '—'}
        </p>
      </div>

      <CarSpecs car={car} />

      <div className="car-pricing">
        <div className="price-main">
          {formatPrice(car.price)}
        </div>
        {car.oldPrice && (
          <div className="price-old">{formatPrice(car.oldPrice)}</div>
        )}
        {priceDiff > 0 && (
          <div className="price-diff" style={{ color: supplier.color }}>
            Ниже рынка на {priceDiff}%
          </div>
        )}
        {car.avgPrice && (
          <div className="price-avg">Средняя: {formatPrice(car.avgPrice)}</div>
        )}
      </div>

      <ScoreBadge score={car.score} scoreLabel={car.scoreLabel} />

      {car.url && (
        <a
          href={car.url}
          target="_blank"
          rel="noopener noreferrer"
          className="car-link"
          style={{
            backgroundColor: supplier.color,
            color: '#fff',
          }}
        >
          Смотреть на сайте
        </a>
      )}
    </div>
  );
}

export default function CarCard({ carA, carB }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFlipping, setIsFlipping] = useState(false);
  const cars = [carA, carB].filter(Boolean);

  if (cars.length === 0) return null;
  if (cars.length === 1) return <CarSide car={cars[0]} isFlipped={false} />;

  const activeCar = cars[activeIndex];
  const otherSupplier = getSupplierConfig(cars[1 - activeIndex]?.source);

  function handleFlip() {
    if (isFlipping) return;
    setIsFlipping(true);
    setTimeout(() => {
      setActiveIndex(prev => 1 - prev);
      setIsFlipping(false);
    }, 200);
  }

  return (
    <div className="comparison-card">
      <div className={`comparison-content ${isFlipping ? 'flip-exit' : ''}`}>
        <CarSide car={activeCar} isFlipped={isFlipping} />
      </div>

      <div className="flip-controls">
        {cars.map((car, i) => {
          const supplier = getSupplierConfig(car.source);
          return (
            <button
              key={i}
              className={`flip-dot ${i === activeIndex ? 'active' : ''}`}
              onClick={handleFlip}
              style={{
                borderColor: supplier.borderColor,
                backgroundColor: i === activeIndex ? supplier.color : 'transparent',
              }}
              aria-label={`Показать ${supplier.name}`}
            />
          );
        })}
        <span className="flip-hint">
          Нажмите для сравнения
        </span>
      </div>

      <button
        className="flip-next"
        onClick={handleFlip}
        style={{ color: otherSupplier.textColor }}
        aria-label="Следующий автомобиль"
      >
        {otherSupplier.name}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </button>
    </div>
  );
}

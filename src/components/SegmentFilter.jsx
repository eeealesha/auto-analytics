import React from 'react'

const SEGMENTS = [
  { key: 'all', label: 'Все' },
  { key: 'economy', label: 'Эконом' },
  { key: 'business', label: 'Бизнес' },
  { key: 'luxury', label: 'Люкс' },
]

const BODY_TYPES = ['Все типы кузова', 'Седан', 'Внедорожник', 'Купе', 'Лифтбэк', 'Хэтчбэк', 'Фургон']

export default function SegmentFilter({
  selectedSegment,
  onSegmentChange,
  economyMax,
  luxuryMin,
  onThresholdsChange,
  bodyType,
  onBodyTypeChange,
  bodyTypes = BODY_TYPES,
}) {
  const formatPrice = (v) => `${(v / 1_000_000).toFixed(1)}М ₽`

  return (
    <div className="segment-filter">
      <div className="segment-buttons">
        {SEGMENTS.map(s => (
          <button
            key={s.key}
            className={`segment-btn ${selectedSegment === s.key ? 'active' : ''}`}
            onClick={() => onSegmentChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="segment-sliders">
        <label>
          Эконом до {formatPrice(economyMax)}
          <input
            type="range"
            min={500_000}
            max={5_000_000}
            step={100_000}
            value={economyMax}
            onChange={(e) => onThresholdsChange({ economyMax: Number(e.target.value), luxuryMin })}
          />
        </label>
        <label>
          Люкс от {formatPrice(luxuryMin)}
          <input
            type="range"
            min={3_000_000}
            max={20_000_000}
            step={500_000}
            value={luxuryMin}
            onChange={(e) => onThresholdsChange({ economyMax, luxuryMin: Number(e.target.value) })}
          />
        </label>
      </div>

      <select value={bodyType} onChange={(e) => onBodyTypeChange(e.target.value)}>
        <option value="all">Все типы кузова</option>
        {bodyTypes.map(bt => (
          <option key={bt} value={bt}>{bt}</option>
        ))}
      </select>
    </div>
  )
}

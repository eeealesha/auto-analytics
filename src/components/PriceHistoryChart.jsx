import React, { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { getSegment } from '../utils/segmentation'

export default function PriceHistoryChart({
  historyDates,
  historyData,
  selectedSegment,
  thresholds,
  selectedBrand,
}) {
  const [startDate, setStartDate] = useState(historyDates[historyDates.length - 1] || '')
  const [brand, setBrand] = useState(selectedBrand || 'all')

  const brands = useMemo(() => {
    const set = new Set()
    historyData.forEach(cars => {
      cars.forEach(c => set.add(c.brand))
    })
    return ['all', ...Array.from(set).sort()]
  }, [historyData])

  const chartData = useMemo(() => {
    if (!startDate || historyDates.length === 0) return []

    const startIdx = historyDates.indexOf(startDate)
    const relevantDates = historyDates.slice(startIdx)

    return relevantDates.map(date => {
      const cars = historyData.get(date) || []
      let filtered = cars.filter(c => {
        const seg = getSegment(c, thresholds)
        return selectedSegment === 'all' || seg === selectedSegment
      })
      if (brand !== 'all') {
        filtered = filtered.filter(c => c.brand === brand)
      }
      const avg = filtered.length > 0
        ? Math.round(filtered.reduce((sum, c) => sum + c.price, 0) / filtered.length)
        : null
      return { date, avgPrice: avg, count: filtered.length }
    }).filter(d => d.avgPrice !== null)
  }, [historyDates, historyData, startDate, selectedSegment, thresholds, brand])

  const formatPrice = (v) => v ? `${(v / 1_000_000).toFixed(1)}М` : ''

  const change = useMemo(() => {
    if (chartData.length < 2) return null
    const first = chartData[0].avgPrice
    const last = chartData[chartData.length - 1].avgPrice
    return ((last - first) / first * 100).toFixed(1)
  }, [chartData])

  if (historyDates.length === 0) {
    return (
      <div className="chart-container">
        <h3>Динамика цен</h3>
        <p className="no-data">Нет данных об истории цен. Запустите парсер для сбора снапшотов.</p>
      </div>
    )
  }

  return (
    <div className="chart-container">
      <h3>Динамика цен</h3>

      <div className="history-controls">
        <label>
          С даты:
          <select value={startDate} onChange={(e) => setStartDate(e.target.value)}>
            {historyDates.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label>
          Марка:
          <select value={brand} onChange={(e) => setBrand(e.target.value)}>
            {brands.map(b => (
              <option key={b} value={b}>{b === 'all' ? 'Все марки' : b}</option>
            ))}
          </select>
        </label>

        {change !== null && (
          <span className={`change-badge ${Number(change) >= 0 ? 'up' : 'down'}`}>
            {Number(change) >= 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis tickFormatter={formatPrice} />
          <Tooltip formatter={(v) => [`${(v / 1_000_000).toFixed(2)}М ₽`, 'Средняя цена']} />
          <Line type="monotone" dataKey="avgPrice" stroke="#8884d8" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

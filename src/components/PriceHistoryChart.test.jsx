import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import PriceHistoryChart from './PriceHistoryChart'

const mockHistory = new Map([
  ['2026-08-20', [
    { brand: 'Kia', model: 'Rio', price: 800000, segment: 'economy' },
    { brand: 'BMW', model: '5 серия', price: 3500000, segment: 'business' },
  ]],
  ['2026-08-21', [
    { brand: 'Kia', model: 'Rio', price: 790000, segment: 'economy' },
    { brand: 'BMW', model: '5 серия', price: 3400000, segment: 'business' },
  ]],
])

describe('PriceHistoryChart', () => {
  it('renders chart title', () => {
    render(
      <PriceHistoryChart
        historyDates={['2026-08-20', '2026-08-21']}
        historyData={mockHistory}
        selectedSegment="all"
        thresholds={{ economyMax: 2000000, luxuryMin: 6000000 }}
        selectedBrand="all"
      />
    )
    expect(screen.getByText(/Динамика цен/)).toBeDefined()
  })

  it('shows no data message when history is empty', () => {
    render(
      <PriceHistoryChart
        historyDates={[]}
        historyData={new Map()}
        selectedSegment="all"
        thresholds={{ economyMax: 2000000, luxuryMin: 6000000 }}
        selectedBrand="all"
      />
    )
    expect(screen.getByText(/Нет данных/)).toBeDefined()
  })

  it('renders date picker with available dates', () => {
    render(
      <PriceHistoryChart
        historyDates={['2026-08-20', '2026-08-21']}
        historyData={mockHistory}
        selectedSegment="all"
        thresholds={{ economyMax: 2000000, luxuryMin: 6000000 }}
        selectedBrand="all"
      />
    )
    expect(screen.getByDisplayValue('2026-08-21')).toBeDefined()
  })

  it('renders brand selector', () => {
    render(
      <PriceHistoryChart
        historyDates={['2026-08-20', '2026-08-21']}
        historyData={mockHistory}
        selectedSegment="all"
        thresholds={{ economyMax: 2000000, luxuryMin: 6000000 }}
        selectedBrand="all"
      />
    )
    expect(screen.getByText('Все марки')).toBeDefined()
    expect(screen.getByText('Kia')).toBeDefined()
    expect(screen.getByText('BMW')).toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SegmentFilter from './SegmentFilter'

const defaultProps = {
  selectedSegment: 'all',
  onSegmentChange: () => {},
  economyMax: 2000000,
  luxuryMin: 6000000,
  onThresholdsChange: () => {},
  bodyType: 'all',
  onBodyTypeChange: () => {},
  bodyTypes: ['Седан', 'Внедорожник', 'Купе'],
}

describe('SegmentFilter', () => {
  it('renders segment buttons', () => {
    render(<SegmentFilter {...defaultProps} />)
    expect(screen.getByText('Все')).toBeDefined()
    expect(screen.getByText('Эконом')).toBeDefined()
    expect(screen.getByText('Бизнес')).toBeDefined()
    expect(screen.getByText('Люкс')).toBeDefined()
  })

  it('calls onSegmentChange when segment clicked', () => {
    const onChange = vi.fn()
    render(<SegmentFilter {...defaultProps} onSegmentChange={onChange} />)
    fireEvent.click(screen.getByText('Бизнес'))
    expect(onChange).toHaveBeenCalledWith('business')
  })

  it('renders body type dropdown', () => {
    render(<SegmentFilter {...defaultProps} />)
    expect(screen.getByDisplayValue('Все типы кузова')).toBeDefined()
  })

  it('renders threshold sliders', () => {
    render(<SegmentFilter {...defaultProps} />)
    expect(screen.getByText(/Эконом до/)).toBeDefined()
    expect(screen.getByText(/Люкс от/)).toBeDefined()
  })

  it('calls onThresholdsChange when slider moved', () => {
    const onChange = vi.fn()
    render(<SegmentFilter {...defaultProps} onThresholdsChange={onChange} />)
    const sliders = screen.getAllByRole('slider')
    fireEvent.change(sliders[0], { target: { value: 1500000 } })
    expect(onChange).toHaveBeenCalled()
  })
})

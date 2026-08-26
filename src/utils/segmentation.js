const DEFAULT_THRESHOLDS = {
  economyMax: 2_000_000,
  luxuryMin: 6_000_000,
}

export function getDefaultThresholds() {
  return { ...DEFAULT_THRESHOLDS }
}

export function getSegment(car, thresholds) {
  if (!car || car.price == null) return 'unknown'
  if (car.price < thresholds.economyMax) return 'economy'
  if (car.price >= thresholds.luxuryMin) return 'luxury'
  return 'business'
}

export function getCarsBySegment(cars, segment, thresholds) {
  if (segment === 'all') return cars
  return cars.filter(car => getSegment(car, thresholds) === segment)
}
const MIN_RELIABLE_MILEAGE = 500;

export function calcAnnualMileage(car, currentYear = new Date().getFullYear()) {
  if (!car.mileage || car.mileage <= MIN_RELIABLE_MILEAGE) return null;
  if (!car.year) return null;
  if (car.isNew) return null;

  const age = Math.max(1, currentYear - car.year);
  return Math.round(car.mileage / age);
}

export function formatAnnual(annualMileage) {
  if (!annualMileage) return '—';
  return new Intl.NumberFormat('ru-RU').format(annualMileage) + ' км/год';
}

export const CAR_FIELDS = [
  'id',
  'brand',
  'model',
  'name',
  'year',
  'mileage',
  'bodyType',
  'fuelType',
  'engineVolume',
  'horsepower',
  'transmission',
  'driveType',
  'color',
  'owners',
  'price',
  'oldPrice',
  'url',
  'image',
  'isNew',
  'source',
];

export function validateCar(car) {
  if (!car || typeof car !== 'object') return false;
  if (car.id == null) return false;
  if (!car.brand) return false;
  if (!car.model) return false;
  return true;
}

export function normalizeField(name, value) {
  if (value === undefined || value === '') return null;
  if (name === 'price' || name === 'mileage' || name === 'year' || name === 'horsepower' || name === 'owners') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  if (name === 'engineVolume') {
    const num = Number(value);
    return Number.isFinite(num) && num > 0 ? num : null;
  }
  return value;
}

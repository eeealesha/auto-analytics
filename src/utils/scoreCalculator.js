export function calculateScore(cars) {
  const stats = {};

  cars.forEach(car => {
    const key = `${car.brand}-${car.model}`;
    if (!stats[key]) {
      stats[key] = { prices: [], mileages: [], years: [] };
    }
    stats[key].prices.push(car.price);
    if (car.mileage) stats[key].mileages.push(car.mileage);
    if (car.year) stats[key].years.push(car.year);
  });

  const averages = {};
  for (const [key, data] of Object.entries(stats)) {
    averages[key] = {
      avgPrice: data.prices.reduce((a, b) => a + b, 0) / data.prices.length,
      avgMileage: data.mileages.length > 0
        ? data.mileages.reduce((a, b) => a + b, 0) / data.mileages.length
        : 0,
      avgYear: data.years.length > 0
        ? data.years.reduce((a, b) => a + b, 0) / data.years.length
        : 0,
      count: data.prices.length,
    };
  }

  return cars.map(car => {
    const key = `${car.brand}-${car.model}`;
    const avg = averages[key];
    if (!avg || avg.count < 2) return { ...car, score: 0, scoreLabel: 'Мало данных' };

    const priceDiff = (avg.avgPrice - car.price) / avg.avgPrice * 100;

    let mileageBonus = 0;
    if (car.mileage && avg.avgMileage > 0) {
      mileageBonus = (avg.avgMileage - car.mileage) / avg.avgMileage * 10;
    }

    let yearBonus = 0;
    if (car.year && avg.avgYear > 0) {
      yearBonus = (car.year - avg.avgYear) * 3;
    }

    const score = Math.round(priceDiff + mileageBonus + yearBonus);

    let scoreLabel = 'Средняя';
    if (score > 20) scoreLabel = 'Отличная сделка';
    else if (score > 10) scoreLabel = 'Хорошая сделка';

    return { ...car, score, scoreLabel, avgPrice: Math.round(avg.avgPrice) };
  });
}

export function formatPrice(price) {
  return new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
}

export function formatMileage(mileage) {
  if (!mileage) return '—';
  return new Intl.NumberFormat('ru-RU').format(mileage) + ' км';
}

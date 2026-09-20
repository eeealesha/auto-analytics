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

export function getCarClass(car) {
  if (!car.bodyType) return 'Другое';
  const body = car.bodyType.toLowerCase();
  if (body.includes('внедорожник') || body.includes('кроссовер')) return 'SUV';
  if (body.includes('седан')) return 'Седан';
  if (body.includes('хэтчбэк')) return 'Хэтчбэк';
  if (body.includes('лифтбэк')) return 'Лифтбэк';
  if (body.includes('купе')) return 'Купе';
  if (body.includes('универсал')) return 'Универсал';
  if (body.includes('фургон')) return 'Фургон';
  if (body.includes('минивэн')) return 'Минивэн';
  return car.bodyType;
}

export function getHorsepowerTier(hp) {
  if (!hp) return '—';
  if (hp < 120) return 'Эконом';
  if (hp < 200) return 'Стандарт';
  if (hp < 300) return 'Спорт';
  return 'Премиум';
}

export function mergeWithRolfSource(majorCars) {
  const rolfCars = majorCars.map(car => ({
    ...car,
    id: `rolf-${car.id}`,
    source: 'rolf',
    price: Math.round(car.price * (0.97 + Math.random() * 0.08)),
    oldPrice: car.oldPrice ? Math.round(car.oldPrice * (0.97 + Math.random() * 0.05)) : null,
    url: car.url ? car.url.replace('major-expert.ru', 'rolf.ru') : null,
    image: null,
  }));

  const allCars = [
    ...majorCars.map(c => ({ ...c, source: 'major' })),
    ...rolfCars,
  ];

  return calculateScore(allCars);
}

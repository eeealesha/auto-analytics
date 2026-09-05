import { describe, it, expect } from 'vitest';
import { offerRowToCar, historyRowsToDays } from '../server/serialize.js';

describe('offerRowToCar', () => {
  it('преобразует snake_case строку БД в camelCase объявление дашборда', () => {
    const car = offerRowToCar({
      id: '5', source: 'major-expert', source_id: '42', url: 'u', image: 'i',
      brand: 'BMW', model: 'X4', name: 'X4 (G02/F98)', year: 2024, mileage: 7363,
      body_type: 'Внедорожник', fuel_type: 'Бензин', engine_volume: '2', horsepower: 245,
      transmission: 'АКПП (автомат)', drive_type: 'Полный привод', color: 'серый',
      owners: 1, is_new: false, price: '7700000', old_price: null,
    });
    expect(car.source).toBe('major-expert');
    expect(car.bodyType).toBe('Внедорожник');
    expect(car.fuelType).toBe('Бензин');
    expect(car.engineVolume).toBe(2); // NUMERIC возвращается строкой -> Number
    expect(car.driveType).toBe('Полный привод');
    expect(car.engineVolume).toBe(2);
    expect(car.isNew).toBe(false);
    expect(car.price).toBe(7700000);
    expect(car.oldPrice).toBeNull();
  });
});

describe('historyRowsToDays', () => {
  it('группирует строки истории по датам', () => {
    const { dates, byDate } = historyRowsToDays([
      { date: '2026-09-05', brand: 'BMW', model: 'X4', price: '5000000' },
      { date: '2026-09-05', brand: 'Audi', model: 'Q7', price: '4000000' },
      { date: '2026-09-06', brand: 'BMW', model: 'X4', price: '4900000' },
    ]);
    expect(dates).toEqual(['2026-09-05', '2026-09-06']);
    expect(byDate['2026-09-05']).toHaveLength(2);
    expect(byDate['2026-09-06'][0].price).toBe(4900000);
  });

  it('пустой вход -> пустой результат', () => {
    expect(historyRowsToDays([])).toEqual({ dates: [], byDate: {} });
  });
});

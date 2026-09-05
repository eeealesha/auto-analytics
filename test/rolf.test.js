// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
vi.mock('axios', () => ({
  default: { get: vi.fn() },
}));
import fs from 'fs';
import axios from 'axios';
import { normalizeRolfItem, fetchPage } from '../scraper/rolf.js';

const fixture = JSON.parse(fs.readFileSync(
  new URL('./fixtures/rolf-vehicles-page-1.json', import.meta.url), 'utf8'
));
const items = fixture.data.items;
const item = items[0];
const bmw = items.find(i => i.brand?.alias === 'bmw');

describe('normalizeRolfItem', () => {
  it('маппит item в формат offers (source rolf)', () => {
    const car = normalizeRolfItem(item);
    expect(car.id).toBe(item.id);
    expect(car.brand).toBe('Mercedes-Benz');
    expect(car.model).toBe('G-Класс');
    expect(car.year).toBe(item.year);
    expect(car.mileage).toBe(item.mileage);
    expect(car.price).toBe(item.price);
    expect(car.horsepower).toBe(item.engine_power);
    expect(car.isNew).toBe(false);
  });

  it('engineCapacity в см³ переводит в литры', () => {
    const car = normalizeRolfItem({ ...item, engine_capacity: 2493, year: 2020, price: 100 });
    expect(car.engineVolume).toBe(2.5);
  });

  it('engineCapacity из фикстуры (1995 см³ → 2.0)', () => {
    const car = normalizeRolfItem(bmw);
    expect(car.engineVolume).toBe(2.0);
    expect(car.owners).toBe(1);
  });

  it('name собирается как brand.name + model.name + complectation', () => {
    const car = normalizeRolfItem(item);
    expect(car.name).toBe('Mercedes-Benz G-Класс G 450 d AMG Line');
  });

  it('url строится из алиасов', () => {
    const car = normalizeRolfItem(item);
    expect(car.url).toBe('https://www.rolf.ru/cars/used/mercedes_benz/g-klass/24596498/');
  });

  it('owners = 0 когда поле отсутствует', () => {
    const car = normalizeRolfItem({ ...item, owners_number: undefined });
    expect(car.owners).toBe(0);
  });

  it('oldPrice = null когда price_old пуст', () => {
    const car = normalizeRolfItem({ ...item, price_old: null });
    expect(car.oldPrice).toBeNull();
  });

  it('колонки контракта fuel/drive/body/transmission/color/image', () => {
    const car = normalizeRolfItem(item);
    expect(car.bodyType).toBe(item.body);
    expect(car.fuelType).toBe(item.engine_type);
    expect(car.transmission).toBe(item.transmission);
    expect(car.driveType).toBe(item.drive_wheel);
    expect(car.color).toBe(item.color_name);
    expect(car.image).toBe(item.images[0].url);
  });
});

describe('fetchPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('успех возвращает ok:true и cars', async () => {
    axios.get.mockResolvedValue({
      data: { success: true, data: { items: [{ id: 1, brand: { name: 'BMW' }, model: { name: 'X5' }, price: 100 }], total_count: 1, pagination: { last_page: 1 } } },
    });
    const res = await fetchPage(1);
    expect(res.ok).toBe(true);
    expect(res.cars[0].id).toBe(1);
    expect(res.total).toBe(1);
    expect(res.lastPage).toBe(1);
  });

  it('после двух ошибок возвращает ok:false', async () => {
    axios.get.mockRejectedValue(new Error('net'));
    const res = await fetchPage(1);
    expect(res.ok).toBe(false);
    expect(res.cars).toEqual([]);
  });
});

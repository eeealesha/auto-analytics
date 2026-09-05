// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app.js';

function makeDb(overrides = {}) {
  return {
    getOffers: async () => ([{
      id: 1, source: 'major-expert', brand: 'BMW', model: 'X4', name: 'X4',
      year: 2024, mileage: 7363, body_type: 'Внедорожник', fuel_type: 'Бензин',
      engine_volume: '2', horsepower: 245, transmission: 'АКПП', drive_type: 'Полный привод',
      color: 'серый', owners: 1, is_new: false, price: '7700000', old_price: null,
      url: 'u', image: 'i',
    }]),
    getHistory: async () => ([{ date: '2026-09-05', brand: 'BMW', model: 'X4', price: '7700000' }]),
    getMeta: async () => ({ sources: ['major-expert'], brands: ['BMW'], years: [2024] }),
    ...overrides,
  };
}

describe('API', () => {
  it('GET /api/health возвращает ok', async () => {
    const res = await request(createApp(makeDb())).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('GET /api/meta возвращает метаданные', async () => {
    const res = await request(createApp(makeDb())).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body.brands).toEqual(['BMW']);
  });

  it('GET /api/offers сериализует объявления в camelCase', async () => {
    const res = await request(createApp(makeDb())).get('/api/offers');
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ brand: 'BMW', bodyType: 'Внедорожник', isNew: false, price: 7700000, source: 'major-expert' });
  });

  it('GET /api/history возвращает сгруппированную историю', async () => {
    const res = await request(createApp(makeDb())).get('/api/history');
    expect(res.status).toBe(200);
    expect(res.body.dates).toEqual(['2026-09-05']);
    expect(res.body.byDate['2026-09-05']).toHaveLength(1);
  });

  it('GET /api/offers передаёт фильтры в getOffers', async () => {
    const getOffers = vi.fn().mockResolvedValue([]);
    await request(createApp(makeDb({ getOffers }))).get('/api/offers?source=rolf&brand=BMW&yearFrom=2020&yearTo=2024');
    expect(getOffers).toHaveBeenCalledWith(expect.objectContaining({ source: 'rolf', brand: 'BMW', yearFrom: '2020', yearTo: '2024' }));
  });

  it('GET /api/offers передаёт limit в getOffers', async () => {
    const getOffers = vi.fn().mockResolvedValue([]);
    await request(createApp(makeDb({ getOffers }))).get('/api/offers?source=rolf&limit=25');
    expect(getOffers).toHaveBeenCalledWith(expect.objectContaining({ source: 'rolf', limit: '25' }));
  });

  it('GET /api/history передаёт days в getHistory', async () => {
    const getHistory = vi.fn().mockResolvedValue({ dates: [], byDate: {} });
    await request(createApp(makeDb({ getHistory }))).get('/api/history?days=30&source=rolf');
    expect(getHistory).toHaveBeenCalledWith(expect.objectContaining({ source: 'rolf', days: '30' }));
  });

  it('при ошибке БД возвращает 500', async () => {
    const db = makeDb({ getOffers: async () => { throw new Error('db down'); } });
    const res = await request(createApp(db)).get('/api/offers');
    expect(res.status).toBe(500);
  });
});

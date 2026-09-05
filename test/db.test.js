// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { offerToRow, buildOfferQuery, initSchema, applySync, getOffers, getHistory } from '../scraper/db.js';

describe('offerToRow', () => {
  it('маппит camelCase объявление в snake_case строку БД', () => {
    const car = {
      id: 42, brand: 'BMW', model: 'X4', name: 'X4 (G02/F98)',
      year: 2024, mileage: 7363, bodyType: 'Внедорожник', fuelType: 'Бензин',
      engineVolume: 2, horsepower: 245, transmission: 'АКПП (автомат)',
      driveType: 'Полный привод', color: 'серый', owners: 1,
      price: 7700000, oldPrice: null, isNew: false,
      url: 'https://major-expert.ru/car/42', image: 'img.jpg',
    };
    const row = offerToRow(car, 'major-expert');
    expect(row.source).toBe('major-expert');
    expect(row.source_id).toBe('42');
    expect(row.body_type).toBe('Внедорожник');
    expect(row.fuel_type).toBe('Бензин');
    expect(row.engine_volume).toBe(2);
    expect(row.drive_type).toBe('Полный привод');
    expect(row.is_new).toBe(false);
    expect(row.price).toBe(7700000);
    expect(row.old_price).toBeNull();
  });

  it('корректно обрабатывает отсутствующие поля (null)', () => {
    const row = offerToRow({ id: 1, brand: 'Lada', model: null, price: 800000 }, 'major-expert');
    expect(row.model).toBeNull();
    expect(row.year).toBeNull();
    expect(row.owners).toBeNull();
    expect(row.is_new).toBe(false);
  });
});

describe('buildOfferQuery', () => {
  it('без фильтров выбирает только активные', () => {
    const { where, params } = buildOfferQuery({});
    expect(where).toBe('is_active = TRUE');
    expect(params).toEqual([]);
  });

  it('накладывает фильтры source, brand, yearFrom, yearTo', () => {
    const { where, params } = buildOfferQuery({ source: 'rolf', brand: 'BMW', yearFrom: '2020', yearTo: '2024' });
    expect(where).toContain('is_active = TRUE');
    expect(where).toContain('source = $1');
    expect(where).toContain('brand = $2');
    expect(where).toContain('year >= $3');
    expect(where).toContain('year <= $4');
    expect(params).toEqual(['rolf', 'BMW', 2020, 2024]);
  });

  it('числовые фильтры преобразует в Number', () => {
    const { params } = buildOfferQuery({ yearFrom: '2020' });
    expect(params[0]).toBe(2020);
  });
});

describe('buildOfferQuery limit', () => {
  it('limit добавляет LIMIT только при валидном положительном числе', () => {
    const { sql, params } = buildOfferQuery({ source: 'rolf', limit: '10' });
    expect(sql).toContain('LIMIT 10');
    expect(buildOfferQuery({ source: 'rolf', limit: 'abc' }).sql).not.toContain('LIMIT');
  });
});

describe('applySync (интеграция с PostgreSQL)', () => {
  const dsn = process.env.DATABASE_URL;
  const itDb = dsn ? it : it.skip;

  itDb('upsert, история цен и деактивация пропавших', async () => {
    const pool = new (await import('pg')).Pool({ connectionString: dsn });
    await initSchema(pool);

    await applySync(pool, {
      source: 'major-expert',
      cars: [
        { id: 1, brand: 'BMW', model: 'X4', price: 5000000, isNew: false },
        { id: 2, brand: 'Audi', model: 'Q7', price: 4000000, isNew: false },
      ],
      today: '2026-09-05',
    });

    const offers = await getOffers(pool, {});
    expect(offers.map(o => o.source_id).sort()).toEqual(['1', '2']);
    const history = await getHistory(pool, {});
    expect(history.length).toBe(2);
    expect(history.every(r => r.date === '2026-09-05')).toBe(true);

    const res1 = await applySync(pool, {
      source: 'major-expert',
      cars: [{ id: 1, brand: 'BMW', model: 'X4', price: 4900000, isNew: false }],
      today: '2026-09-05',
    });
    expect(res1.inserted).toBe(0);
    expect(res1.updated).toBe(1);
    const active = await getOffers(pool, {});
    expect(active).toHaveLength(1); // id=2 деактивирован
    expect(active[0].price).toBe('4900000'); // pg отдаёт BIGINT строкой
    const lastHistory = (await getHistory(pool, {})).filter(r => r.brand === 'BMW');
    expect(lastHistory).toHaveLength(1); // UNIQUE(offer_id,date) — перезаписан, не дублирован
    expect(lastHistory[0].price).toBe('4900000');
  });

  itDb('пустой батч или deactivate:false никогда не деактивирует', async () => {
    const pool = new (await import('pg')).Pool({ connectionString: dsn });
    await initSchema(pool);

    const source = 'rolf';
    const carA = { id: 9001, brand: 'BMW', model: 'X4', price: 5000000, isNew: false };
    const carB = { id: 9002, brand: 'Audi', model: 'Q7', price: 4000000, isNew: false };

    // (a) sync 2 cars → both active
    await applySync(pool, { source, cars: [carA, carB], today: '2026-09-05' });
    const activeAfterA = await getOffers(pool, { source });
    expect(activeAfterA.map(o => o.source_id).sort()).toEqual(['9001', '9002']);

    // (b) sync only id 9001 with deactivate:false → both still active (unseen preserved)
    await applySync(pool, {
      source,
      cars: [carA],
      today: '2026-09-05',
      deactivate: false,
    });
    const activeAfterB = await getOffers(pool, { source });
    expect(activeAfterB.map(o => o.source_id).sort()).toEqual(['9001', '9002']);

    // (c) sync with deactivate:true but cars:[] → both still active (empty batch never deactivates)
    await applySync(pool, { source, cars: [], today: '2026-09-05', deactivate: true });
    const activeAfterC = await getOffers(pool, { source });
    expect(activeAfterC.map(o => o.source_id).sort()).toEqual(['9001', '9002']);

    // cleanup — убрать rolf-строки, чтобы не загрязнять другие тесты в той же БД
    await pool.query('DELETE FROM offers WHERE source = $1', [source]);
    await pool.end();
  });
});

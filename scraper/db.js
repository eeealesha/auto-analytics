// Data layer: PostgreSQL schema, mapping and sync for auto-analytics.
import pg from 'pg';

const { Pool } = pg;

export function offerToRow(car, source) {
  return {
    source,
    source_id: String(car.id),
    url: car.url || null,
    image: car.image || null,
    brand: car.brand,
    model: car.model || null,
    name: car.name || null,
    year: car.year ?? null,
    mileage: car.mileage ?? null,
    body_type: car.bodyType ?? null,
    fuel_type: car.fuelType ?? null,
    engine_volume: car.engineVolume ?? null,
    horsepower: car.horsepower ?? null,
    transmission: car.transmission ?? null,
    drive_type: car.driveType ?? null,
    color: car.color ?? null,
    owners: car.owners ?? null,
    is_new: Boolean(car.isNew),
    price: car.price,
    old_price: car.oldPrice ?? null,
  };
}

export function buildOfferQuery(filters = {}) {
  const where = ['is_active = TRUE'];
  const params = [];
  const push = (col, op, value) => {
    params.push(value);
    where.push(`${col} ${op} $${params.length}`);
  };
  if (filters.source) push('source', '=', filters.source);
  if (filters.brand) push('brand', '=', filters.brand);
  if (filters.yearFrom) push('year', '>=', Number(filters.yearFrom));
  if (filters.yearTo) push('year', '<=', Number(filters.yearTo));
  let limitSql = '';
  if (Number.isInteger(+filters.limit) && +filters.limit > 0) {
    limitSql = ` LIMIT ${+filters.limit}`;
  }
  const sql = `SELECT * FROM offers WHERE ${where.join(' AND ')} ORDER BY id${limitSql}`;
  return { where: where.join(' AND '), params, sql };
}

export function createPool(dsn) {
  return new Pool({ connectionString: dsn });
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS offers (
    id            BIGSERIAL PRIMARY KEY,
    source        TEXT NOT NULL,
    source_id     TEXT NOT NULL,
    url           TEXT,
    image         TEXT,
    brand         TEXT NOT NULL,
    model         TEXT,
    name          TEXT,
    year          INTEGER,
    mileage       INTEGER,
    body_type     TEXT,
    fuel_type     TEXT,
    engine_volume NUMERIC,
    horsepower    INTEGER,
    transmission  TEXT,
    drive_type    TEXT,
    color         TEXT,
    owners        INTEGER,
    is_new        BOOLEAN NOT NULL DEFAULT FALSE,
    price         BIGINT NOT NULL,
    old_price     BIGINT,
    first_seen    DATE NOT NULL DEFAULT CURRENT_DATE,
    last_seen     DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (source, source_id)
);

CREATE TABLE IF NOT EXISTS price_history (
    id        BIGSERIAL PRIMARY KEY,
    offer_id  BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    date      DATE NOT NULL DEFAULT CURRENT_DATE,
    price     BIGINT NOT NULL,
    old_price BIGINT,
    UNIQUE (offer_id, date)
);

CREATE INDEX IF NOT EXISTS idx_offers_brand ON offers(brand);
CREATE INDEX IF NOT EXISTS idx_offers_year ON offers(year);
CREATE INDEX IF NOT EXISTS idx_offers_source_active ON offers(source, is_active);
CREATE INDEX IF NOT EXISTS idx_price_history_offer_date ON price_history(offer_id, date);
`;

const UPSERT_OFFER = `
INSERT INTO offers (source, source_id, url, image, brand, model, name, year, mileage,
  body_type, fuel_type, engine_volume, horsepower, transmission, drive_type, color,
  owners, is_new, price, old_price, last_seen, is_active)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, TRUE)
ON CONFLICT (source, source_id) DO UPDATE SET
  url = EXCLUDED.url, image = EXCLUDED.image, brand = EXCLUDED.brand, model = EXCLUDED.model,
  name = EXCLUDED.name, year = EXCLUDED.year, mileage = EXCLUDED.mileage, body_type = EXCLUDED.body_type,
  fuel_type = EXCLUDED.fuel_type, engine_volume = EXCLUDED.engine_volume, horsepower = EXCLUDED.horsepower,
  transmission = EXCLUDED.transmission, drive_type = EXCLUDED.drive_type, color = EXCLUDED.color,
  owners = EXCLUDED.owners, is_new = EXCLUDED.is_new, price = EXCLUDED.price, old_price = EXCLUDED.old_price,
  last_seen = EXCLUDED.last_seen, is_active = TRUE
RETURNING id, source_id, (xmax = 0) AS is_new_row;
`;

const INSERT_HISTORY = `
INSERT INTO price_history (offer_id, date, price, old_price)
VALUES ($1, $2::date, $3, $4)
ON CONFLICT (offer_id, date) DO UPDATE SET
  price = EXCLUDED.price,
  old_price = EXCLUDED.old_price;
`;

const DEACTIVATE = `
UPDATE offers SET is_active = FALSE
WHERE source = $1 AND is_active AND NOT (source_id = ANY($2::text[]));
`;

export async function initSchema(pool) {
  await pool.query(SCHEMA);
}

export async function applySync(pool, { source, cars, today, deactivate = true }) {
  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  let deactivated = 0;
  try {
    await client.query('BEGIN');
    const saved = [];
    for (const car of cars) {
      const r = offerToRow(car, source);
      const { rows } = await client.query(UPSERT_OFFER, [
        r.source, r.source_id, r.url, r.image, r.brand, r.model, r.name, r.year, r.mileage,
        r.body_type, r.fuel_type, r.engine_volume, r.horsepower, r.transmission, r.drive_type,
        r.color, r.owners, r.is_new, r.price, r.old_price, today,
      ]);
      saved.push({ id: Number(rows[0].id), car });
      if (rows[0].is_new_row) inserted++; else updated++;
    }
    for (const { id, car } of saved) {
      await client.query(INSERT_HISTORY, [id, today, car.price, car.oldPrice ?? null]);
    }
    let deactivated = 0;
    if (deactivate && cars.length > 0) {
      const { rowCount } = await client.query(DEACTIVATE, [source, cars.map(c => String(c.id))]);
      deactivated = rowCount;
    }
    await client.query('COMMIT');
    return { inserted, updated, deactivated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getOffers(pool, filters = {}) {
  const { sql, params } = buildOfferQuery(filters);
  const { rows } = await pool.query(sql, params);
  return rows;
}

export async function getHistory(pool, { source, days = 90 } = {}) {
  const params = [];
  let where = 'WHERE h.date >= CURRENT_DATE - $1';
  params.push(Number.isInteger(+days) && +days > 0 ? +days : 90);
  if (source) {
    params.push(source);
    where += ` AND o.source = $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT to_char(h.date, 'YYYY-MM-DD') AS date, o.brand, o.model, h.price
     FROM price_history h
     JOIN offers o ON o.id = h.offer_id
     ${where}
     ORDER BY h.date`,
    params,
  );
  return rows;
}

export async function getMeta(pool) {
  const sources = (await pool.query('SELECT DISTINCT source FROM offers ORDER BY source')).rows.map(r => r.source);
  const brands = (await pool.query('SELECT DISTINCT brand FROM offers ORDER BY brand')).rows.map(r => r.brand);
  const years = (await pool.query('SELECT DISTINCT year FROM offers WHERE year IS NOT NULL ORDER BY year DESC')).rows.map(r => r.year);
  return { sources, brands, years };
}

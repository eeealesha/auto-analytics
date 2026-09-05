import { createPool, initSchema } from './db.js';

export async function runMigrate(pool, init = initSchema) {
  await init(pool);
  await pool.end();
  console.log('Схема PostgreSQL готова');
}

if (process.env.AUTO_MIGRATE === '1') {
  const dsn = process.env.DATABASE_URL;
  if (!dsn) {
    console.error('DATABASE_URL не задан — миграция пропущена');
    process.exit(1);
  }
  runMigrate(createPool(dsn)).catch(err => {
    console.error('Ошибка при создании схемы:', err.message);
    process.exit(1);
  });
}

// Преобразование строк БД в JSON-формат дашборда (camelCase, как в data/cars.json).
export function offerRowToCar(row) {
  return {
    id: Number(row.id),
    source: row.source,
    brand: row.brand,
    model: row.model,
    name: row.name,
    year: row.year,
    mileage: row.mileage,
    bodyType: row.body_type,
    fuelType: row.fuel_type,
    engineVolume: row.engine_volume != null ? Number(row.engine_volume) : null,
    horsepower: row.horsepower,
    transmission: row.transmission,
    driveType: row.drive_type,
    color: row.color,
    owners: row.owners,
    price: Number(row.price),
    oldPrice: row.old_price != null ? Number(row.old_price) : null,
    isNew: row.is_new,
    url: row.url,
    image: row.image,
  };
}

export function historyRowsToDays(rows) {
  const byDate = {};
  rows.forEach(r => {
    if (!byDate[r.date]) byDate[r.date] = [];
    byDate[r.date].push({ brand: r.brand, model: r.model, price: Number(r.price) });
  });
  return { dates: Object.keys(byDate).sort(), byDate };
}

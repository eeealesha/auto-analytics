import express from 'express';
import { offerRowToCar, historyRowsToDays } from './serialize.js';

export function createApp(db) {
  const app = express();

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/meta', async (req, res, next) => {
    try {
      res.json(await db.getMeta());
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/offers', async (req, res, next) => {
    try {
      const filters = {
        source: req.query.source || undefined,
        brand: req.query.brand || undefined,
        yearFrom: req.query.yearFrom || undefined,
        yearTo: req.query.yearTo || undefined,
        limit: req.query.limit || undefined,
      };
      const rows = await db.getOffers(filters);
      res.json(rows.map(offerRowToCar));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/history', async (req, res, next) => {
    try {
      const rows = await db.getHistory({ source: req.query.source || undefined, days: req.query.days || undefined });
      res.json(historyRowsToDays(rows));
    } catch (err) {
      next(err);
    }
  });

  // error-handler: обязательны 4 аргумента, иначе Express не считает его таковым
  app.use((err, req, res, next) => {
    console.error('API error:', err.message);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

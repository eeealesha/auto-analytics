import path from 'node:path';
import express from 'express';
import { offerRowToCar, historyRowsToDays } from './serialize.js';

export function createApp(db, { staticDir } = {}) {
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

  // Неизвестный /api/* — честный 404 JSON, иначе его перехватит SPA-catch-all
  // ниже и клиент получит index.html со статусом 200.
  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not found' });
  });

  // Статика регистрируется здесь, а не после createApp: Express подбирает
  // обработчик ошибок только среди зарегистрированных ПОСЛЕ упавшего middleware.
  if (staticDir) {
    app.use(express.static(staticDir));
    app.get('/*splat', (req, res) => res.sendFile(path.join(staticDir, 'index.html')));
  }

  // error-handler: обязательны 4 аргумента, иначе Express не считает его таковым
  app.use((err, req, res, next) => {
    console.error('API error:', err.message);
    res.status(500).json({ error: 'internal error' });
  });

  return app;
}

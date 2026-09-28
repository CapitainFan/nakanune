import type { HealthResponse } from '@nakanune/shared';
import { Router } from 'express';
import { prisma } from '../db';

export const healthRouter = Router();

// Жив ли сервер и есть ли связь с базой. Фронт показывает это на главной.
healthRouter.get('/', async (_req, res) => {
  let db: HealthResponse['db'] = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = 'down';
  }

  const body: HealthResponse = {
    status: db === 'up' ? 'ok' : 'degraded',
    db,
    time: new Date().toISOString(),
  };
  res.status(db === 'up' ? 200 : 503).json(body);
});

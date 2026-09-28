import { Prisma } from '@nakanune/db';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import { env } from './env';
import { HttpError } from './lib/http';
import { exportRouter } from './routes/export';
import { healthRouter } from './routes/health';
import { scheduleRouter } from './routes/schedule';
import { subjectsRouter } from './routes/subjects';
import { tasksRouter } from './routes/tasks';

// Стандартные сообщения zod об ошибках — на русском
z.config(z.locales.ru());

// Приложение собирается отдельно от app.listen() — так его можно
// тестировать через supertest, не занимая порт.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.WEB_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/subjects', subjectsRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/export', exportRouter);
  app.use('/api/schedule', scheduleRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}

// Коды ошибок Prisma, которые означают ошибку клиента, а не сервера
const PRISMA_ERRORS: Record<string, { status: number; message: string }> = {
  P2025: { status: 404, message: 'Не найдено' },
  P2002: { status: 409, message: 'Такая запись уже есть' },
  P2003: { status: 400, message: 'Связанная запись не найдена' },
};

// Express 5 сам передаёт сюда ошибки из async-обработчиков —
// в Express 4 (и в StudyPlan) для этого нужен был try/catch в каждом маршруте.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const known = PRISMA_ERRORS[err.code];
    if (known) {
      res.status(known.status).json({ error: known.message });
      return;
    }
  }

  // Ошибки express.json(): битый JSON — 400, слишком большое тело — 413
  if (isClientError(err)) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};

function isClientError(err: unknown): err is { status: number; message: string } {
  return (
    err instanceof Error &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500
  );
}

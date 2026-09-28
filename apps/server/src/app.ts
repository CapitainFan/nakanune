import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { env } from './env';
import { healthRouter } from './routes/health';

// Приложение собирается отдельно от app.listen() — так его можно будет
// тестировать через supertest, не занимая порт.
export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors({ origin: env.WEB_ORIGIN }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });
  app.use(errorHandler);

  return app;
}

// Express 5 сам передаёт сюда ошибки из async-обработчиков —
// в Express 4 (и в StudyPlan) для этого нужен был try/catch в каждом маршруте.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};

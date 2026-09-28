import { validate as isValidCron } from 'node-cron';
import { z } from 'zod';

// Переменные окружения проверяем один раз при старте: с неверным конфигом
// сервер падает сразу с понятной ошибкой, а не посреди запроса.
// Файл .env подгружает Node (флаг --env-file-if-exists в package.json),
// в проде переменные задаёт хостинг.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.url(),
  // В StudyPlan был cors() для всех сайтов (баг №12) — у нас только адрес фронта.
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  // Когда перепроверять расписание пар (по Минску). По умолчанию — каждый день в 6:00.
  SCHEDULE_CRON: z.string().refine(isValidCron, 'Неверное cron-выражение').default('0 6 * * *'),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    console.error(`Неверные переменные окружения:\n${z.prettifyError(result.error)}`);
    process.exit(1);
  }
  return result.data;
}

export const env = loadEnv();

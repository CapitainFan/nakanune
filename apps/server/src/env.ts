import { validate as isValidCron } from 'node-cron';
import { z } from 'zod';

// Переменные окружения проверяем один раз при старте: с неверным конфигом
// сервер падает сразу с понятной ошибкой, а не посреди запроса.
// Файл .env подгружает Node (флаг --env-file-if-exists в package.json),
// в проде переменные задаёт хостинг.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  // На каком адресе слушать. По умолчанию только этот компьютер: API без авторизации, и
  // с 0.0.0.0 любой в той же Wi-Fi-сети прочитал бы задания и сообщения из Telegram
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.url(),
  // В StudyPlan был cors() для всех сайтов (баг №12) — у нас только адрес фронта.
  // Ключ доступа к API. Обязателен, если API открыт в интернет (ngrok): без него любой, кто
  // узнает адрес, прочитает задания и сообщения из Telegram. Сгенерировать:
  // node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  API_TOKEN: z
    .string()
    .optional()
    .transform((token) => token?.trim() || undefined)
    .refine(
      (token) => token === undefined || token.length >= 32,
      'Ключ доступа — не короче 32 символов',
    ),
  // Можно несколько через запятую: локальный фронт и фронт на Vercel
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((list) => list.split(',').map((origin) => origin.trim().replace(/\/$/, '')))
    .pipe(z.array(z.url()).min(1)),
  // Когда перепроверять расписание пар (по Минску). По умолчанию — каждый день в 6:00.
  SCHEDULE_CRON: z.string().refine(isValidCron, 'Неверное cron-выражение').default('0 6 * * *'),
  // Без ключа разбор текста работает эвристикой. Пустая строка в .env — тоже «нет ключа».
  GEMINI_API_KEY: z
    .string()
    .optional()
    .transform((key) => key?.trim() || undefined),
  // Модели по очереди: бесплатный тариф часто отвечает 503 «high demand» на новые модели,
  // тогда пробуем следующую. Порядок — по тому, что стабильнее отвечало на разборе чатов.
  GEMINI_MODELS: z
    .string()
    .default('gemini-2.5-flash,gemini-3.6-flash,gemini-3.8-flash,gemini-3.5-flash-lite')
    .transform((list) =>
      list
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()).min(1, 'Укажи хотя бы одну модель')),
  // Ключ для ссылок и сессий источников (в ссылке календаря Moodle — личный токен).
  // 32 байта в base64: openssl rand -base64 32. Без него источники с секретами не добавить
  ENCRYPTION_KEY: z
    .string()
    .optional()
    .transform((key) => key?.trim() || undefined)
    .refine(
      (key) => key === undefined || Buffer.from(key, 'base64').length === 32,
      'Нужны 32 байта в base64: openssl rand -base64 32',
    ),
  // Telegram-клиент (этап 5): https://my.telegram.org → API development tools. Без них Telegram
  // просто выключен. Сама сессия — в базе, зашифрованной (см. telegram/session.ts)
  TG_API_ID: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().positive().optional(),
  ),
  TG_API_HASH: z
    .string()
    .optional()
    .transform((hash) => hash?.trim() || undefined),
  // Как часто проверять источники заданий (Moodle, потом Telegram). По умолчанию — раз в час
  CRON_SCHEDULE: z.string().refine(isValidCron, 'Неверное cron-выражение').default('0 * * * *'),
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

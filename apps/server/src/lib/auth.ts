import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../env';
import { HttpError } from './http';

// Один пользователь — один ключ доступа (API_TOKEN). Фронт шлёт его заголовком
// Authorization: Bearer <ключ>. Сравниваем хэши через timingSafeEqual: время ответа не
// подсказывает, сколько символов ключа угадано.
function same(given: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/**
 * Ключ для ленты календаря. Приложения-календари не умеют слать заголовки, поэтому ключ —
 * в ссылке. Он свой, выводится из API_TOKEN и подходит только к ленте: утечёт ссылка на
 * календарь — к остальному API доступа не будет.
 */
export function feedToken(apiToken: string): string {
  return createHmac('sha256', apiToken).update('calendar-feed').digest('hex').slice(0, 40);
}

/** Пути относительно /api, которые проверяют ключ ленты в ?token= вместо заголовка. */
const FEED_PATHS = new Set(['/export/calendar.ics']);

/**
 * Проверка ключа на всех маршрутах /api (кроме /api/health — он подключён раньше).
 * Ключ не задан — API работает без него, но только напрямую с этого компьютера: запрос через
 * туннель (ngrok, Cloudflare) несёт X-Forwarded-For, и такой отклоняем — случайно открыть
 * API в интернет без ключа нельзя.
 */
export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = env.API_TOKEN;
  if (!token) {
    if (req.get('x-forwarded-for')) {
      throw new HttpError(
        503,
        'API открыт через туннель, а ключ доступа не задан — впиши API_TOKEN в .env сервера',
      );
    }
    next();
    return;
  }

  const bearer = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '')?.[1];
  if (bearer && same(bearer, token)) {
    next();
    return;
  }
  const queryToken = req.query.token;
  if (
    FEED_PATHS.has(req.path) &&
    typeof queryToken === 'string' &&
    same(queryToken, feedToken(token))
  ) {
    next();
    return;
  }
  throw new HttpError(401, 'Нужен ключ доступа');
};

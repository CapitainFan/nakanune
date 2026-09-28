import { env } from '../env';
import type { GeminiConfig } from './gemini';

/** Ключ и модели Gemini из окружения; без ключа — null (разбор эвристикой). */
export function geminiFromEnv(): GeminiConfig | null {
  return env.GEMINI_API_KEY ? { apiKey: env.GEMINI_API_KEY, models: env.GEMINI_MODELS } : null;
}

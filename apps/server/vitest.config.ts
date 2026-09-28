import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Тесты маршрутов работают с отдельной базой nakanune_test на том же Postgres,
// что и разработка, — рабочие данные они не трогают.
// Уже заданные переменные окружения loadEnvFile не перезаписывает (важно для CI).
const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  if (!process.env.DATABASE_URL) {
    throw new Error('Для тестов нужен TEST_DATABASE_URL или DATABASE_URL в .env');
  }
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/nakanune_test';
  return url.toString();
}

export default defineConfig({
  test: {
    // Ключ Gemini в тестах всегда пустой: настоящий API тесты не трогают, ИИ подменяется
    env: {
      DATABASE_URL: testDatabaseUrl(),
      GEMINI_API_KEY: '',
      // Тестовый ключ шифрования (32 байта) — не настоящий, только для тестов
      ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    },
    // Создаёт тестовую базу и накатывает миграции (адрес берёт из env выше)
    globalSetup: ['./test/global-setup.ts'],
    // Файлы с тестами маршрутов делят одну базу — запускаем их по очереди
    fileParallelism: false,
  },
});

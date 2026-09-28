import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';

/**
 * Создаёт Prisma Client. Адрес базы передаёт вызывающий код (сервер берёт его
 * из провалидированного env), поэтому пакет сам не читает process.env.
 * Prisma 7 ходит в Postgres через драйвер pg — его подключает адаптер.
 */
export function createPrismaClient(databaseUrl: string) {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    // Без таймаута запрос к недоступной базе может висеть бесконечно.
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({ adapter });
}

// Типы моделей (Task, Subject…), enum'ы (TaskStatus, Priority…) и namespace Prisma.
export * from './generated/prisma/client';

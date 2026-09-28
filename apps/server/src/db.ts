import { createPrismaClient } from '@nakanune/db';
import { env } from './env';

// Один клиент на весь процесс: внутри у него пул соединений с Postgres.
export const prisma = createPrismaClient(env.DATABASE_URL);

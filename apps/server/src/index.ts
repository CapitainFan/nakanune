import { createApp } from './app';
import { prisma } from './db';
import { env } from './env';

const server = createApp().listen(env.PORT, (error) => {
  if (error) throw error;
  console.log(`Nakanune API: http://localhost:${env.PORT}`);
});

// Корректная остановка: дождаться текущих запросов и закрыть пул соединений с базой.
async function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal}: останавливаю сервер`);
  await new Promise((resolve) => server.close(resolve));
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

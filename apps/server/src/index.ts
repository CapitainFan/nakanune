import { createApp } from './app';
import { startCron } from './cron';
import { prisma } from './db';
import { env } from './env';
import { prepareSchedules } from './sources/scheduleSync';
import { disconnectTelegram } from './telegram/client';

const server = createApp().listen(env.PORT, env.HOST, (error) => {
  if (error) throw error;
  console.log(`Nakanune API: http://${env.HOST}:${env.PORT}`);
});

// Расписание сразу из снимка в репозитории, если в базе его нет или снимок новее —
// без запросов к сайту ММФ (с Render он недоступен)
prepareSchedules().catch((error: unknown) => {
  console.error('Не удалось загрузить расписание из снимка:', error);
});

// Cron запускается только здесь, а не в createApp(): в тестах фоновых задач не нужно
startCron();

// Корректная остановка: дождаться текущих запросов и закрыть пул соединений с базой.
async function shutdown(signal: NodeJS.Signals) {
  console.log(`${signal}: останавливаю сервер`);
  await new Promise((resolve) => server.close(resolve));
  await disconnectTelegram();
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

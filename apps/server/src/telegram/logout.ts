// Выход из Telegram: pnpm tg:logout. Завершает сессию на стороне Telegram (она пропадёт из
// «Активных сеансов» в настройках) и удаляет её из базы.
import { prisma } from '../db';
import { createClient } from './client';
import { deleteSession, loadSession } from './session';

async function main() {
  const stored = await loadSession();
  if (!stored) {
    console.log('Вход в Telegram и так не выполнен.');
    return;
  }
  const client = createClient(stored.session);
  try {
    await client.connect();
    await client.logOut();
  } catch (error) {
    // Сессию уже отозвали в самом Telegram — всё равно удаляем её у себя
    console.warn(`Telegram: ${error instanceof Error ? error.message : error}`);
  }
  await deleteSession();
  console.log('Вышли из Telegram, сессия удалена.');
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });

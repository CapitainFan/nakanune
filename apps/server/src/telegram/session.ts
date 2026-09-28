import { prisma } from '../db';
import { openSecret, sealSecret } from '../lib/secrets';

// Сессия Telegram = полный доступ к аккаунту. Храним в базе зашифрованной (ключ —
// ENCRYPTION_KEY из окружения): чтобы ей воспользоваться, нужны и база, и ключ.
// Никуда не выводим и в браузер не отдаём.
const NAME = 'telegram';

export async function loadSession(): Promise<{ session: string; updatedAt: Date } | null> {
  const row = await prisma.credential.findUnique({ where: { name: NAME } });
  return row ? { session: openSecret(row.value), updatedAt: row.updatedAt } : null;
}

export async function saveSession(session: string): Promise<void> {
  const value = sealSecret(session);
  await prisma.credential.upsert({
    where: { name: NAME },
    create: { name: NAME, value },
    update: { value },
  });
}

export async function deleteSession(): Promise<void> {
  await prisma.credential.deleteMany({ where: { name: NAME } });
}

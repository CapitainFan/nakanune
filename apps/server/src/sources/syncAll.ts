import type { SourceSyncResult } from '@nakanune/shared';
import { prisma } from '../db';
import { syncMoodleSource } from './moodleSync';
import { syncTelegramSource } from './telegramSync';

export type SyncAllItem = { sourceId: string; title: string; sync: SourceSyncResult };

let running: Promise<SyncAllItem[]> | null = null;

/**
 * Проверяет все включённые источники заданий — это делает cron и кнопка «Обновить всё».
 * По очереди, а не параллельно: так бережнее к Moodle и к лимитам Telegram (FloodWait).
 * Ошибка одного источника пишется в его lastError и не мешает остальным.
 * Если проверка уже идёт — ждём её, а не запускаем вторую.
 */
export function syncAllSources(): Promise<SyncAllItem[]> {
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

async function run(): Promise<SyncAllItem[]> {
  const sources = await prisma.source.findMany({
    where: { enabled: true, type: { in: ['MOODLE_ICS', 'TELEGRAM'] } },
    orderBy: { title: 'asc' },
  });
  const results: SyncAllItem[] = [];
  for (const source of sources) {
    results.push({ sourceId: source.id, title: source.title, sync: await syncSource(source) });
  }
  return results;
}

/** Синхронизация источника его способом. Расписание пар сюда не входит — у него свой cron. */
export function syncSource(source: { id: string; type: string }): Promise<SourceSyncResult> {
  return source.type === 'TELEGRAM' ? syncTelegramSource(source.id) : syncMoodleSource(source.id);
}

import type { SourceSyncResult } from '@nakanune/shared';
import { prisma } from '../db';
import { syncMoodleSource } from './moodleSync';

export type SyncAllItem = { sourceId: string; title: string; sync: SourceSyncResult };

let running: Promise<SyncAllItem[]> | null = null;

/**
 * Проверяет все включённые источники заданий — это делает cron и кнопка «Обновить всё».
 * По очереди, а не параллельно: так бережнее к Moodle (и к лимитам Telegram на этапе 5).
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
    where: { enabled: true, type: 'MOODLE_ICS' },
    orderBy: { title: 'asc' },
  });
  const results: SyncAllItem[] = [];
  for (const source of sources) {
    results.push({
      sourceId: source.id,
      title: source.title,
      sync: await syncMoodleSource(source.id),
    });
  }
  return results;
}

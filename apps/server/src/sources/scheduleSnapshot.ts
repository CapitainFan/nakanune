import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { fetchScheduleHtml } from './mmfSchedule';

/**
 * Снимок расписания в репозитории: HTML таблицы — ровно то, что отдаёт сайт факультета.
 * Нужен, когда сервер не может достучаться до mmf.bsu.by (Render за границей, а сайты БГУ
 * иностранные адреса не пускают): расписание всё равно есть — из снимка, без запросов.
 * Обновить снимок — `pnpm schedule:snapshot` с компьютера в Беларуси (без VPN), потом коммит.
 */
/** Страница группы на сайте ММФ — как в сиде. */
export const SCHEDULE_PAGE_URL =
  'https://mmf.bsu.by/ru/raspisanie-zanyatij/dnevnoe-otdelenie/1-kurs/2-gruppa/';

export const SNAPSHOT_FILE = path.resolve(import.meta.dirname, '../../data/mmf-schedule.json');

export const ScheduleSnapshotSchema = z.object({
  url: z.url(),
  /** Когда HTML взят с сайта (или сверен с ним). */
  fetchedAt: z.iso.datetime(),
  html: z.string().min(1),
});

export type ScheduleSnapshot = z.infer<typeof ScheduleSnapshotSchema>;

/** Снимок из файла; нет файла — null. Битый файл — ошибка: его положили в репозиторий руками. */
export async function readScheduleSnapshot(file = SNAPSHOT_FILE): Promise<ScheduleSnapshot | null> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    return null;
  }
  return ScheduleSnapshotSchema.parse(JSON.parse(text));
}

/** Скачивает расписание с сайта и перезаписывает снимок. */
export async function writeScheduleSnapshot(
  url: string,
  file = SNAPSHOT_FILE,
): Promise<ScheduleSnapshot> {
  const snapshot: ScheduleSnapshot = {
    url,
    fetchedAt: new Date().toISOString(),
    html: await fetchScheduleHtml(url),
  };
  await writeFile(file, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

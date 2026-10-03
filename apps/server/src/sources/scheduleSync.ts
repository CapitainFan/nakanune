import { createHash } from 'node:crypto';
import type { Prisma, Subject } from '@nakanune/db';
import { ScheduleConfigSchema, normalizeTitle, type ScheduleConfig } from '@nakanune/shared';
import { prisma } from '../db';
import { makeShortCode } from '../lib/shortCode';
import { fetchScheduleHtml, parseScheduleTable, type ScheduleRow } from './mmfSchedule';
import { readScheduleSnapshot, type ScheduleSnapshot } from './scheduleSnapshot';

export type ScheduleSyncResult =
  | { status: 'updated'; classes: number }
  | { status: 'unchanged' }
  | { status: 'failed'; error: string };

// Синхронизации, которые идут прямо сейчас. Повторный вызов для того же источника
// не запускает вторую загрузку, а ждёт первую (защита от параллельного запуска из ТЗ).
const inFlight = new Map<string, Promise<ScheduleSyncResult>>();

/**
 * Перечитывает расписание с сайта. Если страница не изменилась (тот же хэш), пары не трогает;
 * force — пересобрать всё равно (например, после смены подгруппы).
 * Ошибка не бросается наружу и не сохраняется в источнике: сайт бывает недоступен с сервера
 * (Render за границей) — тогда остаётся прежнее расписание или снимок из репозитория, а ошибку
 * видно только в ответе на «Обновить» и в логе сервера.
 */
export function syncSchedule(
  sourceId: string,
  options: { force?: boolean } = {},
): Promise<ScheduleSyncResult> {
  const running = inFlight.get(sourceId);
  if (running) return running;

  const promise = runSync(sourceId, options.force ?? false).finally(() =>
    inFlight.delete(sourceId),
  );
  inFlight.set(sourceId, promise);
  return promise;
}

async function runSync(sourceId: string, force: boolean): Promise<ScheduleSyncResult> {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });

  try {
    const config = ScheduleConfigSchema.parse(source.config);
    const html = await fetchScheduleHtml(config.url);
    const hash = createHash('sha1').update(html).digest('hex');

    if (!force && hash === source.lastCursor) {
      // Сайт не изменился — расписание актуально на сейчас
      const now = new Date();
      await prisma.source.update({
        where: { id: sourceId },
        data: { lastCheckedAt: now, lastSyncedAt: now, lastError: null },
      });
      return { status: 'unchanged' };
    }

    const rows = parseScheduleTable(html);
    // Если сайт поменял вёрстку и парсер ничего не нашёл — не стираем расписание
    if (rows.length === 0) throw new Error('В таблице расписания не нашлось ни одной пары');

    const classes = await saveSchedule(sourceId, config, rows, hash, new Date());
    return { status: 'updated', classes };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const message = `Сайт ММФ недоступен с сервера (${reason})`;
    console.warn(`Расписание: ${message}`);
    // lastCheckedAt — чтобы не стучаться на сайт при каждом открытии; ошибку не храним
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastCheckedAt: new Date(), lastError: null },
    });
    return { status: 'failed', error: message };
  }
}

/**
 * Расписание из снимка в репозитории — без запросов к сайту. Загружается, если в базе пар нет
 * или снимок новее того, что в базе (его обновили и закоммитили). Свежие данные с сайта
 * старым снимком не затираются.
 */
export async function loadScheduleSnapshot(
  sourceId: string,
  snapshot?: ScheduleSnapshot | null,
): Promise<'imported' | 'skipped'> {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
  const config = ScheduleConfigSchema.parse(source.config);
  const data = snapshot === undefined ? await readScheduleSnapshot() : snapshot;
  if (!data || data.url !== config.url) return 'skipped';

  const fetchedAt = new Date(data.fetchedAt);
  const hasClasses = (await prisma.classSession.count({ where: { sourceId } })) > 0;
  const newer = !source.lastSyncedAt || fetchedAt > source.lastSyncedAt;
  if (hasClasses && !newer) return 'skipped';

  const rows = parseScheduleTable(data.html);
  if (rows.length === 0) return 'skipped';
  const hash = createHash('sha1').update(data.html).digest('hex');
  await saveSchedule(sourceId, config, rows, hash, fetchedAt);
  return 'imported';
}

/** При запуске сервера: у каждого расписания есть пары — хотя бы из снимка. */
export async function prepareSchedules(): Promise<void> {
  const sources = await prisma.source.findMany({ where: { type: 'MMF_SCHEDULE', enabled: true } });
  const snapshot = await readScheduleSnapshot();
  for (const source of sources) {
    if ((await loadScheduleSnapshot(source.id, snapshot)) === 'imported') {
      console.log(`Расписание «${source.title}»: загружено из снимка от ${snapshot?.fetchedAt}`);
    }
  }
}

/** Заменяет пары источника одной транзакцией: либо всё новое расписание, либо старое. */
async function saveSchedule(
  sourceId: string,
  config: ScheduleConfig,
  rows: ScheduleRow[],
  hash: string,
  // Когда данные взяты с сайта: сейчас или время снимка
  syncedAt: Date,
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    // Предмет ищем по названию и алиасам: в расписании бывают опечатки
    // («гусударственности»), они живут в алиасах предмета
    const byName = new Map<string, Subject>();
    for (const subject of await tx.subject.findMany()) {
      for (const name of [subject.name, ...subject.aliases])
        byName.set(normalizeTitle(name), subject);
    }

    const data: Prisma.ClassSessionCreateManyInput[] = [];
    for (const row of rows) {
      const key = normalizeTitle(row.subject);
      let subject = byName.get(key);

      // Моя подгруппа: у предмета своя (английский) или общая из настроек
      const mine = subject?.subgroup ?? config.defaultSubgroup;
      if (row.subgroup && mine && row.subgroup !== mine) continue;

      if (!subject) {
        const name = capitalize(row.subject);
        subject = await tx.subject.create({
          data: { name, shortCode: makeShortCode(name), color: pickColor(name) },
        });
        byName.set(key, subject);
      }

      data.push({
        sourceId,
        subjectId: subject.id,
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
        weekParity: row.weekParity,
        kind: row.kind,
        teacher: row.teacher,
        room: row.room,
        subgroup: row.subgroup,
        validFrom: resolveValidFrom(row.validFrom, config.firstWeekDate),
        note: row.note,
      });
    }

    await tx.classSession.deleteMany({ where: { sourceId } });
    await tx.classSession.createMany({ data });
    await tx.source.update({
      where: { id: sourceId },
      data: {
        lastCursor: hash,
        lastCheckedAt: new Date(),
        lastSyncedAt: syncedAt,
        lastError: null,
      },
    });
    return data.length;
  });
}

/** «с 10.10» → 2026-10-10. Осенний семестр переходит через Новый год: «с 10.02» — уже следующий. */
function resolveValidFrom(from: ScheduleRow['validFrom'], firstWeekDate: string): Date | null {
  if (!from) return null;
  const year = Number(firstWeekDate.slice(0, 4));
  const startMonth = Number(firstWeekDate.slice(5, 7));
  const fallSemester = startMonth >= 8;
  return new Date(
    Date.UTC(fallSemester && from.month < 8 ? year + 1 : year, from.month - 1, from.day),
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PALETTE = [
  '#3b82f6',
  '#8b5cf6',
  '#06b6d4',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
  '#6366f1',
];

/** Цвет нового предмета — по хэшу названия: у одного названия всегда один цвет. */
function pickColor(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return PALETTE[hash % PALETTE.length]!;
}

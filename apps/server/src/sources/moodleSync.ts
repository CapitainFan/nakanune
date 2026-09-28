import { createHash } from 'node:crypto';
import { Prisma } from '@nakanune/db';
import {
  AUTO_ACCEPT_CONFIDENCE,
  buildSubjectMatcher,
  type SourceSyncResult,
} from '@nakanune/shared';
import { z } from 'zod';
import { homeworkSubject, loadExtractionContext } from '../ai/context';
import { prisma } from '../db';
import { dedupeKey } from '../lib/dedupe';
import { openSecret } from '../lib/secrets';
import { insertTasks, type NewTask } from '../tasks/insert';
import { fetchIcs, parseMoodleIcs, type MoodleEvent } from './moodleIcs';

/**
 * Source.config у календаря Moodle: зашифрованная ссылка (в ней личный токен) и адрес
 * сайта открытым текстом — его можно показывать.
 */
export const MoodleConfigSchema = z.object({ urlEncrypted: z.string(), host: z.string() });

/** События старше недели не берём: при первой синхронизации не нужен весь прошлый семестр. */
const KEEP_PAST_MS = 7 * 24 * 60 * 60 * 1000;
const HIGH_PRIORITY = /(?:контрольн|тест|экзамен|зач[её]т|коллоквиум|quiz|exam)/iu;

const inFlight = new Map<string, Promise<SourceSyncResult>>();

/**
 * Синхронизация календаря Moodle. Повторный вызов, пока идёт первый, ждёт его (защита от
 * параллельного запуска). Ошибка не бросается, а пишется в Source.lastError.
 */
export function syncMoodleSource(sourceId: string): Promise<SourceSyncResult> {
  const running = inFlight.get(sourceId);
  if (running) return running;
  const promise = runSync(sourceId).finally(() => inFlight.delete(sourceId));
  inFlight.set(sourceId, promise);
  return promise;
}

async function runSync(sourceId: string): Promise<SourceSyncResult> {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
  try {
    const { urlEncrypted } = MoodleConfigSchema.parse(source.config);
    const now = new Date();
    const events = parseMoodleIcs(await fetchIcs(openSecret(urlEncrypted))).filter(
      (event) => event.dueAt.getTime() >= now.getTime() - KEEP_PAST_MS,
    );

    // Moodle при каждой выгрузке меняет DTSTAMP, поэтому хэш — от разобранных событий,
    // а не от файла: так «ничего не изменилось» действительно значит ничего
    const hash = createHash('sha1').update(JSON.stringify(events)).digest('hex');
    if (hash === source.lastCursor) {
      await prisma.source.update({
        where: { id: sourceId },
        data: { lastCheckedAt: now, lastError: null },
      });
      return { status: 'unchanged' };
    }

    const counts = await saveEvents(sourceId, events, now);
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastCursor: hash, lastCheckedAt: now, lastError: null },
    });
    return { status: 'updated', ...counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastCheckedAt: new Date(), lastError: message },
    });
    return { status: 'failed', error: message };
  }
}

/**
 * События → задания. Новое событие — сырое сообщение (externalId = UID) и задание.
 * У известного события сверяем срок: перенесли в Moodle — переносим и задание (если оно
 * ещё не выполнено). Название не трогаем: его могли поправить руками.
 */
async function saveEvents(
  sourceId: string,
  events: MoodleEvent[],
  now: Date,
): Promise<{ created: number; updated: number }> {
  const context = await loadExtractionContext();
  const matchSubject = buildSubjectMatcher(context.subjects);
  const known = new Map(
    (
      await prisma.rawMessage.findMany({
        where: { sourceId, externalId: { in: events.map((event) => event.uid) } },
        include: { tasks: true },
      })
    ).map((message) => [message.externalId, message]),
  );

  let updated = 0;
  const fresh: { index: number; task: NewTask }[] = [];
  for (const event of events) {
    const text = [event.title, event.course, event.description].filter(Boolean).join('\n');
    const message = known.get(event.uid);

    if (message) {
      if (message.text !== text) {
        await prisma.rawMessage.update({ where: { id: message.id }, data: { text } });
      }
      for (const task of message.tasks) {
        if (task.status === 'DONE' || task.dueAt?.getTime() === event.dueAt.getTime()) continue;
        const key = dedupeKey({ subjectId: task.subjectId, title: task.title, dueAt: event.dueAt });
        try {
          await prisma.task.update({
            where: { id: task.id },
            data: { dueAt: event.dueAt, dueAtIsGuess: false, dedupeKey: key },
          });
          updated++;
        } catch (error) {
          // На новый день уже есть такое же задание (добавили руками) — оставляем как есть
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
            throw error;
          }
        }
      }
      continue;
    }

    // Предмет — по названию курса, а если не нашёлся — по названию события
    const found =
      (event.course && matchSubject(event.course)?.subjectId) ||
      matchSubject(event.title)?.subjectId ||
      null;
    const subjectId = found && homeworkSubject(found, context.practiceOf);
    // Срок из Moodle точный; не уверены только в предмете. Уверенно — сразу в «Задания»,
    // иначе — во «Входящие» на проверку (раздел 8 ТЗ)
    const confidenceScore = subjectId ? 90 : 60;

    const raw = await prisma.rawMessage.create({
      data: {
        sourceId,
        externalId: event.uid,
        text,
        sentAt: event.modifiedAt ?? now,
        processed: true,
      },
    });
    fresh.push({
      index: fresh.length,
      task: {
        title: event.title,
        subjectId,
        dueAt: event.dueAt.toISOString(),
        dueAtIsGuess: false,
        summary: null,
        description: event.description,
        confidenceScore,
        status: confidenceScore >= AUTO_ACCEPT_CONFIDENCE ? 'TODO' : 'INBOX',
        priority: HIGH_PRIORITY.test(event.title) ? 'high' : 'medium',
        labels: [],
        sourceId,
        rawMessageId: raw.id,
      },
    });
  }

  const result = await insertTasks(fresh);
  return { created: result.inserted.length, updated };
}

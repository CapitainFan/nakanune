import type { RawMessage } from '@nakanune/db';
import {
  AUTO_ACCEPT_CONFIDENCE,
  hasTaskSignal,
  linksIn,
  type ExtractResult,
} from '@nakanune/shared';
import { prisma } from '../db';
import { toTaskDto } from '../dto';
import { insertTasks } from '../tasks/insert';
import { loadExtractionContext } from './context';
import { extractDrafts, type Draft, type ExtractOutcome } from './extract';
import type { GeminiConfig } from './gemini';

/** Сообщение из источника. externalId — id в источнике: по нему не разбираем дважды. */
export type IncomingMessage = { externalId: string; sentAt: Date; text: string };

export type IngestOptions = {
  sourceId: string;
  /** Как источник назвать модели: «переписка из чата», «Telegram: 1 курс 2 группа». */
  sourceLabel: string;
  messages: IncomingMessage[];
  gemini: GeminiConfig | null;
  now: Date;
  /** Ручная вставка одного текста: ничего не нашлось — весь текст одним черновиком. */
  wholeTextFallback?: boolean;
  /**
   * Автоисточник (Telegram): уверенное задание (≥ 75) с точным сроком — сразу в «Задания»,
   * остальное — во «Входящие» (раздел 8 ТЗ). Без флага всё идёт на проверку.
   */
  autoAccept?: boolean;
  /**
   * Чат: в ИИ уходят только сообщения с признаком задания и контекст перед ними
   * (раздел 11.1 ТЗ) — болтовня не тратит лимиты бесплатного тарифа.
   */
  prefilter?: boolean;
};

/** Сколько сообщений в одном запросе к ИИ (раздел 11 ТЗ: «пачка до ~30 сообщений»). */
const BATCH_SIZE = 30;
/** Контекст к кандидату: до 5 предыдущих сообщений за час — вопрос «что по геоме?» и т. п. */
const CONTEXT_WINDOW_MS = 60 * 60 * 1000;
const CONTEXT_MESSAGES = 5;

/**
 * Сохраняет сообщения как сырые, разбирает новые и кладёт найденное в задания.
 * Уже разобранные сообщения (та же переписка вставлена ещё раз, в Telegram — повторная
 * синхронизация) не разбираются снова, но уходят в разбор как контекст: вопрос
 * «Что по геоме?» мог прийти в прошлый раз, а ответ на него — сейчас.
 */
export async function ingestMessages(options: IngestOptions): Promise<ExtractResult> {
  const { sourceId, messages } = options;
  // Дедупликация, уровень 1: уникальный индекс (sourceId, externalId)
  await prisma.rawMessage.createMany({
    data: messages.map((message) => ({ sourceId, ...message })),
    skipDuplicates: true,
  });
  const rows = await prisma.rawMessage.findMany({
    where: { sourceId, externalId: { in: messages.map((message) => message.externalId) } },
    orderBy: { sentAt: 'asc' },
  });
  const fresh = new Set(rows.filter((row) => !row.processed).map((row) => row.id));
  const counts = { total: messages.length, skipped: messages.length - fresh.size };
  const nothing = (notice: string): ExtractResult => ({
    engine: null,
    model: null,
    notice,
    messages: counts,
    report: { inserted: [], duplicates: [], errors: [] },
  });

  if (fresh.size === 0) return nothing('Эти сообщения уже разбирались — новых заданий нет');

  const toExtract = options.prefilter ? await withContext(sourceId, rows, fresh) : rows;
  if (toExtract.length === 0) {
    await markProcessed(fresh);
    return nothing('В новых сообщениях нет ничего похожего на задания');
  }

  const context = {
    ...(await loadExtractionContext()),
    now: options.now,
    wholeTextFallback: options.wholeTextFallback,
  };
  const outcomes: ExtractOutcome[] = [];
  for (let start = 0; start < toExtract.length; start += BATCH_SIZE) {
    const batch = toExtract.slice(start, start + BATCH_SIZE).map((row) => ({
      id: row.id,
      sentAt: row.sentAt,
      source: options.sourceLabel,
      text: row.text,
    }));
    outcomes.push(await extractDrafts(batch, context, options.gemini));
  }
  const drafts = outcomes.flatMap((outcome) => outcome.drafts);

  // Ссылки из сообщения — в описание задания: в заголовке им не место, а терять жалко
  const texts = new Map(toExtract.map((row) => [row.id, row.text]));
  const result = await insertTasks(
    drafts
      .filter((draft) => fresh.has(draft.messageId))
      .map(({ messageId, ...draft }, index) => {
        const links = linksIn(texts.get(messageId) ?? '');
        return {
          index,
          task: {
            ...draft,
            description: links.length > 0 ? links.join('\n') : null,
            status: statusFor(draft, options.autoAccept ?? false),
            sourceId,
            rawMessageId: messageId,
          },
        };
      }),
  );
  await markProcessed(fresh);

  return {
    engine: outcomes.some((outcome) => outcome.engine === 'gemini') ? 'gemini' : 'heuristic',
    model: outcomes.find((outcome) => outcome.model)?.model ?? null,
    notice: outcomes.find((outcome) => outcome.notice)?.notice ?? null,
    messages: counts,
    report: {
      inserted: result.inserted.map(toTaskDto),
      duplicates: result.duplicates,
      errors: result.errors,
    },
  };
}

function statusFor(draft: Omit<Draft, 'messageId'>, autoAccept: boolean): 'TODO' | 'INBOX' {
  const confident =
    draft.confidenceScore >= AUTO_ACCEPT_CONFIDENCE && draft.dueAt !== null && !draft.dueAtIsGuess;
  return autoAccept && confident ? 'TODO' : 'INBOX';
}

/**
 * Префильтр: новые сообщения с признаком задания плюс до пяти сообщений за час перед каждым
 * (из этой и прошлых синхронизаций) — там бывает вопрос, который задаёт предмет ответу.
 */
async function withContext(
  sourceId: string,
  rows: RawMessage[],
  fresh: Set<string>,
): Promise<RawMessage[]> {
  const candidates = rows.filter((row) => fresh.has(row.id) && hasTaskSignal(row.text));
  if (candidates.length === 0) return [];

  const first = candidates[0]!.sentAt.getTime();
  const last = candidates.at(-1)!.sentAt.getTime();
  const history = await prisma.rawMessage.findMany({
    where: {
      sourceId,
      sentAt: { gte: new Date(first - CONTEXT_WINDOW_MS), lte: new Date(last) },
    },
    orderBy: { sentAt: 'asc' },
  });

  const picked = new Set<string>();
  const candidateIds = new Set(candidates.map((row) => row.id));
  history.forEach((row, index) => {
    if (!candidateIds.has(row.id)) return;
    picked.add(row.id);
    for (const before of history.slice(Math.max(0, index - CONTEXT_MESSAGES), index)) {
      if (row.sentAt.getTime() - before.sentAt.getTime() <= CONTEXT_WINDOW_MS)
        picked.add(before.id);
    }
  });
  return history.filter((row) => picked.has(row.id));
}

async function markProcessed(ids: Set<string>) {
  await prisma.rawMessage.updateMany({
    where: { id: { in: [...ids] } },
    data: { processed: true },
  });
}

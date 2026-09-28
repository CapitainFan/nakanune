import { linksIn, type ExtractResult } from '@nakanune/shared';
import { prisma } from '../db';
import { toTaskDto } from '../dto';
import { insertTasks } from '../tasks/insert';
import { loadExtractionContext } from './context';
import { extractDrafts } from './extract';
import type { GeminiConfig } from './gemini';

/** Сообщение из источника. externalId — id в источнике: по нему не разбираем дважды. */
export type IncomingMessage = { externalId: string; sentAt: Date; text: string };

export type IngestOptions = {
  sourceId: string;
  /** Как источник назвать модели: «переписка из чата», «вставленный текст». */
  sourceLabel: string;
  messages: IncomingMessage[];
  gemini: GeminiConfig | null;
  now: Date;
  /** Ручная вставка одного текста: ничего не нашлось — весь текст одним черновиком. */
  wholeTextFallback?: boolean;
};

/**
 * Сохраняет сообщения как сырые, разбирает новые и кладёт найденное во «Входящие».
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
  const emptyReport = { inserted: [], duplicates: [], errors: [] };

  if (fresh.size === 0) {
    return {
      engine: null,
      model: null,
      notice: 'Эти сообщения уже разбирались — новых заданий нет',
      messages: counts,
      report: emptyReport,
    };
  }

  const { engine, model, notice, drafts } = await extractDrafts(
    rows.map((row) => ({
      id: row.id,
      sentAt: row.sentAt,
      source: options.sourceLabel,
      text: row.text,
    })),
    {
      ...(await loadExtractionContext()),
      now: options.now,
      wholeTextFallback: options.wholeTextFallback,
    },
    options.gemini,
  );

  // Ссылки из сообщения — в описание задания: в заголовке им не место, а терять жалко
  const texts = new Map(rows.map((row) => [row.id, row.text]));
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
            status: 'INBOX' as const,
            sourceId,
            rawMessageId: messageId,
          },
        };
      }),
  );
  await prisma.rawMessage.updateMany({
    where: { id: { in: [...fresh] } },
    data: { processed: true },
  });

  return {
    engine,
    model,
    notice,
    messages: counts,
    report: {
      inserted: result.inserted.map(toTaskDto),
      duplicates: result.duplicates,
      errors: result.errors,
    },
  };
}

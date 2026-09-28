import type { SourceSyncResult } from '@nakanune/shared';
import { z } from 'zod';
import { geminiFromEnv } from '../ai/config';
import { ingestMessages } from '../ai/ingest';
import { prisma } from '../db';
import { TelegramFloodWait, TelegramNotConnected, getTelegram } from '../telegram/client';

/** Source.config у чата Telegram: как до него достучаться. Секретов тут нет. */
export const TelegramConfigSchema = z.object({
  peer: z.object({
    kind: z.enum(['chat', 'channel']),
    id: z.string(),
    accessHash: z.string().nullable(),
  }),
});

/** Первая синхронизация: только последняя неделя — старое ДЗ уже неактуально. */
const FIRST_SYNC_MS = 7 * 24 * 60 * 60 * 1000;
/** Больше сообщений за одну синхронизацию не берём (раз в час этого хватает с запасом). */
const MAX_MESSAGES = 300;

const inFlight = new Map<string, Promise<SourceSyncResult>>();

/**
 * Читает новые сообщения чата и разбирает их. Только чтение: приложение ничего не пишет
 * и не отмечает прочитанным. Ошибка не бросается, а пишется в Source.lastError.
 */
export function syncTelegramSource(sourceId: string): Promise<SourceSyncResult> {
  const running = inFlight.get(sourceId);
  if (running) return running;
  const promise = runSync(sourceId).finally(() => inFlight.delete(sourceId));
  inFlight.set(sourceId, promise);
  return promise;
}

async function runSync(sourceId: string): Promise<SourceSyncResult> {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
  try {
    const { peer } = TelegramConfigSchema.parse(source.config);
    const telegram = await getTelegram();
    const now = new Date();
    // Курсор — id последнего прочитанного сообщения (у каждого чата своя нумерация)
    const minId = Number(source.lastCursor ?? 0);
    const { messages, maxId } = await telegram.fetchMessages(peer, {
      minId,
      since: minId === 0 ? new Date(now.getTime() - FIRST_SYNC_MS) : null,
      limit: MAX_MESSAGES,
    });

    let created = 0;
    if (messages.length > 0) {
      const result = await ingestMessages({
        sourceId,
        sourceLabel: `Telegram: ${source.title}`,
        messages: messages.map((message) => ({
          externalId: String(message.id),
          sentAt: message.sentAt,
          text: message.text,
        })),
        gemini: geminiFromEnv(),
        now,
        autoAccept: true,
        prefilter: true,
      });
      created = result.report.inserted.length;
    }

    // Курсор двигаем только после разбора: упало посередине — в следующий раз прочитаем снова
    // (повторно сохранённые сообщения отсеет уникальный externalId)
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        lastCursor: String(Math.max(minId, maxId)),
        lastCheckedAt: now,
        lastError: null,
      },
    });
    return messages.length === 0
      ? { status: 'unchanged' }
      : { status: 'updated', created, updated: 0 };
  } catch (error) {
    const message =
      error instanceof TelegramNotConnected || error instanceof TelegramFloodWait
        ? error.message
        : `Telegram: ${error instanceof Error ? error.message : String(error)}`;
    await prisma.source.update({
      where: { id: sourceId },
      data: { lastCheckedAt: new Date(), lastError: message },
    });
    return { status: 'failed', error: message };
  }
}

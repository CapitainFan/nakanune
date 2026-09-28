import { createHash, randomUUID } from 'node:crypto';
import { ExtractRequestSchema, parseTelegramTranscript } from '@nakanune/shared';
import { Router } from 'express';
import { geminiFromEnv } from '../ai/config';
import { ingestMessages, type IncomingMessage } from '../ai/ingest';
import { prisma } from '../db';
import { parseOr400 } from '../lib/http';

export const extractRouter = Router();

/** Источник «вставленный текст» — один на всё приложение. */
const MANUAL_SOURCE_ID = 'manual';

/**
 * Разбор вставленного текста: сообщение, письмо или целая переписка из Telegram Desktop.
 * Найденные задания сохраняются во «Входящие» — всё из ручной вставки проходит проверку,
 * как экран извлечения в StudyPlan.
 */
extractRouter.post('/', async (req, res) => {
  const { text } = parseOr400(ExtractRequestSchema, req.body);
  const now = new Date();

  await prisma.source.upsert({
    where: { id: MANUAL_SOURCE_ID },
    create: { id: MANUAL_SOURCE_ID, type: 'MANUAL', title: 'Вставленный текст', config: {} },
    update: {},
  });

  const chat = parseTelegramTranscript(text);
  // У сообщения из переписки id — хэш времени и текста: вставишь ту же переписку снова
  // (или кусок, который пересекается с прошлым) — старые сообщения не разберутся дважды.
  // Имя автора не сохраняем и никуда не отправляем
  const messages: IncomingMessage[] = chat
    ? chat.map((message) => ({
        externalId: `chat:${createHash('sha1').update(`${message.sentAt.toISOString()}\n${message.text}`).digest('hex')}`,
        sentAt: message.sentAt,
        text: message.text,
      }))
    : [{ externalId: randomUUID(), sentAt: now, text }];

  const result = await ingestMessages({
    sourceId: MANUAL_SOURCE_ID,
    sourceLabel: chat ? 'переписка из учебного чата' : 'вставленный текст',
    messages,
    gemini: geminiFromEnv(),
    now,
    wholeTextFallback: !chat,
  });
  res.status(result.report.inserted.length > 0 ? 201 : 200).json(result);
});

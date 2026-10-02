import { createHash, randomUUID } from 'node:crypto';
import {
  ExtractRequestSchema,
  IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  parseTelegramTranscript,
  type ExtractResult,
} from '@nakanune/shared';
import express, { Router } from 'express';
import { geminiFromEnv } from '../ai/config';
import { loadExtractionContext } from '../ai/context';
import { extractDraftsFromImage } from '../ai/extract';
import { ingestMessages, type IncomingMessage } from '../ai/ingest';
import { prisma } from '../db';
import { toTaskDto } from '../dto';
import { HttpError, parseOr400 } from '../lib/http';
import { insertTasks } from '../tasks/insert';

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

  await ensureManualSource();

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

/**
 * Фото доски, конспекта или скриншота (раздел 11.5 ТЗ): тело запроса — сама картинка
 * (Content-Type: image/jpeg и т. п.). Разбирает только ИИ; найденное — во «Входящие».
 * Текст, который модель прочитала на фото, сохраняется как исходное сообщение.
 */
extractRouter.post(
  '/image',
  express.raw({ type: IMAGE_TYPES, limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    const mimeType = req.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
    const data: unknown = req.body;
    if (!IMAGE_TYPES.includes(mimeType) || !Buffer.isBuffer(data) || data.length === 0) {
      throw new HttpError(400, 'Пришли фото: JPEG, PNG, WEBP или HEIC');
    }
    const gemini = geminiFromEnv();
    if (!gemini) throw new HttpError(503, 'Для разбора фото нужен ИИ — задай GEMINI_API_KEY');

    await ensureManualSource();
    // Одно и то же фото дважды не разбираем: id — хэш содержимого
    const externalId = `photo:${createHash('sha1').update(data).digest('hex')}`;
    const existing = await prisma.rawMessage.findUnique({
      where: { sourceId_externalId: { sourceId: MANUAL_SOURCE_ID, externalId } },
    });
    if (existing?.processed) {
      const body: ExtractResult = {
        engine: null,
        model: null,
        notice: 'Это фото уже разбиралось',
        messages: { total: 1, skipped: 1 },
        report: { inserted: [], duplicates: [], errors: [] },
      };
      res.json(body);
      return;
    }
    const message =
      existing ??
      (await prisma.rawMessage.create({
        data: { sourceId: MANUAL_SOURCE_ID, externalId, text: 'Фото доски', sentAt: new Date() },
      }));

    let outcome;
    try {
      outcome = await extractDraftsFromImage(
        { id: message.id, sentAt: message.sentAt, data, mimeType },
        { ...(await loadExtractionContext()), now: new Date() },
        gemini,
      );
    } catch (error) {
      // Сообщение остаётся неразобранным — то же фото можно отправить ещё раз
      throw new HttpError(502, error instanceof Error ? error.message : 'ИИ не ответил');
    }

    const transcript = outcome.transcript || '(на фото не нашлось текста)';
    await prisma.rawMessage.update({
      where: { id: message.id },
      data: { text: `Фото доски:\n${transcript}`, processed: true },
    });
    const result = await insertTasks(
      outcome.drafts.map(({ messageId, ...draft }, index) => ({
        index,
        task: { ...draft, status: 'INBOX', sourceId: MANUAL_SOURCE_ID, rawMessageId: messageId },
      })),
    );

    const body: ExtractResult = {
      engine: 'gemini',
      model: outcome.model,
      notice:
        outcome.drafts.length === 0
          ? `Заданий на фото не нашлось. ИИ прочитал: «${transcript.slice(0, 300)}»`
          : null,
      messages: { total: 1, skipped: 0 },
      report: {
        inserted: result.inserted.map(toTaskDto),
        duplicates: result.duplicates,
        errors: result.errors,
      },
    };
    res.status(result.inserted.length > 0 ? 201 : 200).json(body);
  },
);

function ensureManualSource() {
  return prisma.source.upsert({
    where: { id: MANUAL_SOURCE_ID },
    create: { id: MANUAL_SOURCE_ID, type: 'MANUAL', title: 'Вставленный текст', config: {} },
    update: {},
  });
}

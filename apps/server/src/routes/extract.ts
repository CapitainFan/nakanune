import { randomUUID } from 'node:crypto';
import { ExtractRequestSchema, type ExtractResult } from '@nakanune/shared';
import { Router } from 'express';
import { loadExtractionContext } from '../ai/context';
import { extractDrafts } from '../ai/extract';
import { prisma } from '../db';
import { toTaskDto } from '../dto';
import { env } from '../env';
import { parseOr400 } from '../lib/http';
import { insertTasks } from '../tasks/insert';

export const extractRouter = Router();

/** Источник «вставленный текст» — один на всё приложение. */
const MANUAL_SOURCE_ID = 'manual';

/**
 * Разбор вставленного текста (сообщение из чата, письмо). Найденные задания сохраняются
 * во «Входящие» — всё из ручной вставки проходит проверку, как экран извлечения в StudyPlan.
 */
extractRouter.post('/', async (req, res) => {
  const { text } = parseOr400(ExtractRequestSchema, req.body);
  const now = new Date();

  const source = await prisma.source.upsert({
    where: { id: MANUAL_SOURCE_ID },
    create: { id: MANUAL_SOURCE_ID, type: 'MANUAL', title: 'Вставленный текст', config: {} },
    update: {},
  });
  // Текст сохраняем как сырое сообщение: карточка во «Входящих» покажет, откуда задание
  const message = await prisma.rawMessage.create({
    data: { sourceId: source.id, externalId: randomUUID(), text, sentAt: now },
  });

  const gemini = env.GEMINI_API_KEY
    ? { apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }
    : null;
  const { engine, notice, drafts } = await extractDrafts(
    [{ id: message.id, sentAt: now, source: 'вставленный текст', text }],
    { ...(await loadExtractionContext()), now, wholeTextFallback: true },
    gemini,
  );

  const result = await insertTasks(
    drafts.map(({ messageId, ...draft }, index) => ({
      index,
      task: { ...draft, status: 'INBOX', sourceId: source.id, rawMessageId: message.id },
    })),
  );
  await prisma.rawMessage.update({ where: { id: message.id }, data: { processed: true } });

  const body: ExtractResult = {
    engine,
    notice,
    report: {
      inserted: result.inserted.map(toTaskDto),
      duplicates: result.duplicates,
      errors: result.errors,
    },
  };
  res.status(result.inserted.length > 0 ? 201 : 200).json(body);
});

import { SourceCreateSchema, type SourceSyncResponse } from '@nakanune/shared';
import { Router } from 'express';
import { prisma } from '../db';
import { toSourceDto } from '../dto';
import { HttpError, parseOr400 } from '../lib/http';
import { sealSecret } from '../lib/secrets';
import { fetchIcs, parseMoodleIcs } from '../sources/moodleIcs';
import { syncAllSources, syncSource } from '../sources/syncAll';
import { connectedTelegram } from './telegram';

export const sourcesRouter = Router();

const withTaskCount = { _count: { select: { tasks: true } } } as const;
const SYNCABLE = new Set(['MOODLE_ICS', 'TELEGRAM']);

/** Источники заданий и расписания. «Вставленный текст» — не источник, его не показываем. */
sourcesRouter.get('/', async (_req, res) => {
  const sources = await prisma.source.findMany({
    where: { type: { not: 'MANUAL' } },
    include: withTaskCount,
    orderBy: { title: 'asc' },
  });
  res.json(sources.map(toSourceDto));
});

/**
 * Добавить источник и сразу синхронизировать — задания появляются без ожидания cron.
 * Moodle: ссылку сначала проверяем, потом сохраняем зашифрованной.
 * Telegram: чат ищем среди твоих диалогов — название и accessHash берём у Telegram.
 */
sourcesRouter.post('/', async (req, res) => {
  const input = parseOr400(SourceCreateSchema, req.body);
  let created: { id: string };

  if (input.type === 'MOODLE_ICS') {
    // Ключа шифрования нет — 503 раньше, чем полезем в Moodle
    const urlEncrypted = sealSecret(input.url);
    try {
      parseMoodleIcs(await fetchIcs(input.url));
    } catch (error) {
      throw new HttpError(
        400,
        error instanceof Error ? error.message : 'Не удалось скачать календарь',
      );
    }
    created = await prisma.source.create({
      data: {
        type: 'MOODLE_ICS',
        title: input.title,
        config: { urlEncrypted, host: new URL(input.url).host },
      },
    });
  } else {
    const telegram = await connectedTelegram();
    const chat = (await telegram.listChats()).find((item) => item.id === input.chatId);
    if (!chat) throw new HttpError(404, 'Такого чата нет среди твоих диалогов');
    if (await findTelegramSource(chat.id)) throw new HttpError(409, 'Этот чат уже добавлен');
    const { title, isGroup: _, ...peer } = chat;
    created = await prisma.source.create({
      data: { type: 'TELEGRAM', title, config: { peer } },
    });
  }

  const sync = await syncSource({ id: created.id, type: input.type });
  const source = await prisma.source.findUniqueOrThrow({
    where: { id: created.id },
    include: withTaskCount,
  });
  res.status(201).json({ source: toSourceDto(source), sync } satisfies SourceSyncResponse);
});

/** Кнопка «Обновить сейчас» у источника. */
sourcesRouter.post('/:id/sync', async (req, res) => {
  const existing = await prisma.source.findUniqueOrThrow({ where: { id: req.params.id } });
  if (!SYNCABLE.has(existing.type)) throw new HttpError(400, 'Этот источник так не обновляется');

  const sync = await syncSource(existing);
  const source = await prisma.source.findUniqueOrThrow({
    where: { id: existing.id },
    include: withTaskCount,
  });
  // 502 — ошибка на стороне Moodle или Telegram; прошлые задания на месте
  res
    .status(sync.status === 'failed' ? 502 : 200)
    .json({ source: toSourceDto(source), sync } satisfies SourceSyncResponse);
});

/** То же, что делает cron: все источники по очереди. */
sourcesRouter.post('/sync-all', async (_req, res) => {
  res.json(await syncAllSources());
});

/**
 * Удалить источник. Его задания остаются (Task.sourceId → null), сырые сообщения удаляются.
 * Расписание так не удаляется: вместе с ним пропали бы все пары.
 */
sourcesRouter.delete('/:id', async (req, res) => {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: req.params.id } });
  if (!SYNCABLE.has(source.type)) throw new HttpError(400, 'Этот источник удалить нельзя');
  await prisma.source.delete({ where: { id: source.id } });
  res.status(204).end();
});

/** Источник Telegram для чата (config.peer.id), если он уже добавлен. */
export function findTelegramSource(chatId: string) {
  return prisma.source.findFirst({
    where: { type: 'TELEGRAM', config: { path: ['peer', 'id'], equals: chatId } },
  });
}

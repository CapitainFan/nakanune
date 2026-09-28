import { SourceCreateSchema, type SourceSyncResponse } from '@nakanune/shared';
import { Router } from 'express';
import { prisma } from '../db';
import { toSourceDto } from '../dto';
import { HttpError, parseOr400 } from '../lib/http';
import { sealSecret } from '../lib/secrets';
import { fetchIcs, parseMoodleIcs } from '../sources/moodleIcs';
import { syncMoodleSource } from '../sources/moodleSync';
import { syncAllSources } from '../sources/syncAll';

export const sourcesRouter = Router();

const withTaskCount = { _count: { select: { tasks: true } } } as const;

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
 * Добавить календарь Moodle. Ссылку сначала проверяем (скачивается ли календарь), потом
 * сохраняем зашифрованной и сразу синхронизируем — задания появляются без ожидания cron.
 */
sourcesRouter.post('/', async (req, res) => {
  const input = parseOr400(SourceCreateSchema, req.body);
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

  const created = await prisma.source.create({
    data: {
      type: 'MOODLE_ICS',
      title: input.title,
      config: { urlEncrypted, host: new URL(input.url).host },
    },
  });
  const sync = await syncMoodleSource(created.id);
  const source = await prisma.source.findUniqueOrThrow({
    where: { id: created.id },
    include: withTaskCount,
  });
  res.status(201).json({ source: toSourceDto(source), sync } satisfies SourceSyncResponse);
});

/** Кнопка «Обновить сейчас» у источника. */
sourcesRouter.post('/:id/sync', async (req, res) => {
  const existing = await prisma.source.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.type !== 'MOODLE_ICS') {
    throw new HttpError(400, 'Этот источник так не обновляется');
  }
  const sync = await syncMoodleSource(existing.id);
  const source = await prisma.source.findUniqueOrThrow({
    where: { id: existing.id },
    include: withTaskCount,
  });
  // 502 — ошибка на стороне Moodle; прошлые задания на месте
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
  if (source.type !== 'MOODLE_ICS' && source.type !== 'TELEGRAM') {
    throw new HttpError(400, 'Этот источник удалить нельзя');
  }
  await prisma.source.delete({ where: { id: source.id } });
  res.status(204).end();
});

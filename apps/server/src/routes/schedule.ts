import type { ScheduleResponse } from '@nakanune/shared';
import { Router } from 'express';
import { prisma } from '../db';
import { toClassSessionDto, toScheduleSourceDto } from '../dto';
import { HttpError } from '../lib/http';
import { syncSchedule } from '../sources/scheduleSync';

export const scheduleRouter = Router();

/** Если сайт не проверяли дольше этого — проверим при следующем открытии приложения. */
const STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/**
 * Недельное расписание. «Обновлять при использовании»: если сайт давно не проверяли,
 * сразу отдаём то, что есть, а проверку запускаем в фоне (refreshing: true — фронт
 * перезапросит чуть позже). Если расписания ещё нет совсем — ждём первую загрузку.
 */
scheduleRouter.get('/', async (_req, res) => {
  const source = await findScheduleSource();
  if (!source) {
    res.json({ source: null, classes: [], refreshing: false } satisfies ScheduleResponse);
    return;
  }

  let refreshing = false;
  if (!source.lastCheckedAt) {
    await syncSchedule(source.id);
  } else if (Date.now() - source.lastCheckedAt.getTime() > STALE_AFTER_MS) {
    refreshing = true;
    syncSchedule(source.id).catch((error: unknown) => {
      console.error('Фоновая синхронизация расписания упала:', error);
    });
  }

  res.json(await scheduleResponse(source.id, refreshing));
});

/** Кнопка «Обновить»: перечитать сайт прямо сейчас. */
scheduleRouter.post('/sync', async (_req, res) => {
  const source = await findScheduleSource();
  if (!source) throw new HttpError(404, 'Источник расписания не настроен');

  const sync = await syncSchedule(source.id, { force: true });
  // 502 — ошибка на стороне сайта факультета; старое расписание всё равно в ответе
  res.status(sync.status === 'failed' ? 502 : 200).json({
    sync,
    ...(await scheduleResponse(source.id, false)),
  });
});

function findScheduleSource() {
  return prisma.source.findFirst({
    where: { type: 'MMF_SCHEDULE', enabled: true },
    orderBy: { id: 'asc' },
  });
}

async function scheduleResponse(sourceId: string, refreshing: boolean): Promise<ScheduleResponse> {
  const [source, classes] = await Promise.all([
    prisma.source.findUniqueOrThrow({ where: { id: sourceId } }),
    prisma.classSession.findMany({
      where: { sourceId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }],
    }),
  ]);
  return {
    source: toScheduleSourceDto(source),
    classes: classes.map(toClassSessionDto),
    refreshing,
  };
}

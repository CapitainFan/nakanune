import type { ScheduleResponse } from '@nakanune/shared';
import { Router } from 'express';
import { prisma } from '../db';
import { toClassSessionDto, toScheduleSourceDto } from '../dto';
import { HttpError } from '../lib/http';
import { loadScheduleSnapshot, syncSchedule } from '../sources/scheduleSync';

export const scheduleRouter = Router();

/** Если сайт не проверяли дольше этого — проверим при следующем открытии приложения. */
const STALE_AFTER_MS = 60 * 60 * 1000;

/**
 * Недельное расписание. Сайт никогда не ждём: пар в базе нет — берём их из снимка в
 * репозитории; сайт давно не проверяли — отдаём то, что есть, а проверку запускаем в фоне
 * (refreshing: true — фронт перезапросит чуть позже). С Render сайт БГУ недоступен — тогда
 * фоновая проверка тихо не удаётся, а расписание остаётся из снимка.
 */
scheduleRouter.get('/', async (_req, res) => {
  const source = await findScheduleSource();
  if (!source) {
    res.json({ source: null, classes: [], refreshing: false } satisfies ScheduleResponse);
    return;
  }

  // Пар ещё нет (новая база) — снимок из репозитория, мгновенно и без сайта
  await loadScheduleSnapshot(source.id);

  let refreshing = false;
  if (!source.lastCheckedAt || Date.now() - source.lastCheckedAt.getTime() > STALE_AFTER_MS) {
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

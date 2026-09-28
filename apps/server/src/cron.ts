import { TIMEZONE } from '@nakanune/shared';
import { schedule } from 'node-cron';
import { prisma } from './db';
import { env } from './env';
import { syncSchedule } from './sources/scheduleSync';

/**
 * Фоновые задачи сервера. Пока одна: «изредка» перепроверять расписание пар —
 * по умолчанию раз в сутки. Второй триггер — открытие приложения (GET /api/schedule).
 */
export function startCron() {
  schedule(
    env.SCHEDULE_CRON,
    async () => {
      try {
        const sources = await prisma.source.findMany({
          where: { type: 'MMF_SCHEDULE', enabled: true },
        });
        for (const source of sources) {
          const result = await syncSchedule(source.id);
          console.log(`Расписание «${source.title}»: ${result.status}`);
        }
      } catch (error) {
        console.error('Cron: синхронизация расписания упала', error);
      }
    },
    // noOverlap: если прошлый запуск ещё идёт, новый пропускается
    { timezone: TIMEZONE, name: 'schedule-sync', noOverlap: true },
  );
}

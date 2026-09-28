import { TIMEZONE } from '@nakanune/shared';
import { schedule } from 'node-cron';
import { prisma } from './db';
import { env } from './env';
import { syncSchedule } from './sources/scheduleSync';
import { syncAllSources } from './sources/syncAll';

/**
 * Фоновые задачи сервера:
 * - источники заданий (Moodle, потом Telegram) — по CRON_SCHEDULE, по умолчанию раз в час;
 * - расписание пар — «изредка», по SCHEDULE_CRON (раз в сутки). Второй триггер —
 *   открытие приложения (GET /api/schedule).
 */
export function startCron() {
  schedule(
    env.CRON_SCHEDULE,
    async () => {
      try {
        for (const { title, sync } of await syncAllSources()) {
          const details = sync.status === 'failed' ? `: ${sync.error}` : '';
          console.log(`Источник «${title}»: ${sync.status}${details}`);
        }
      } catch (error) {
        console.error('Cron: синхронизация источников упала', error);
      }
    },
    { timezone: TIMEZONE, name: 'sources-sync', noOverlap: true },
  );

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

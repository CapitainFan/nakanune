'use client';

import { inMinsk } from '@nakanune/shared';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ghostButton } from '@/components/ui';
import { useScheduleStore } from '@/store/schedule';

/** Откуда расписание, когда его проверяли и кнопка «Обновить». */
export function ScheduleStatus() {
  const schedule = useScheduleStore((s) => s.schedule);
  const syncing = useScheduleStore((s) => s.syncing);
  const syncSchedule = useScheduleStore((s) => s.syncSchedule);

  const source = schedule?.source;
  if (!source) return null;

  return (
    <div className="flex items-start justify-between gap-3 border-t border-zinc-200 pt-3 text-xs text-zinc-500 dark:border-zinc-800">
      <div>
        <p>
          Расписание с{' '}
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2"
          >
            сайта ММФ
          </a>
          {/* Дата данных, а не проверки: с сервера за границей сайт бывает недоступен, и тогда
              расписание — из снимка в репозитории. Ошибку обновления показывает только тост */}
          {source.lastSyncedAt &&
            ` · данные от ${format(source.lastSyncedAt, 'd MMMM, HH:mm', { locale: ru, in: inMinsk })}`}
          {schedule.refreshing && ' · проверяю, не изменилось ли…'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void syncSchedule()}
        disabled={syncing}
        className={`${ghostButton} shrink-0 text-xs`}
      >
        {syncing ? 'Обновляю…' : 'Обновить'}
      </button>
    </div>
  );
}

'use client';

import { toast } from 'sonner';
import { ghostButton } from '@/components/ui';
import { API_URL } from '@/lib/api';

const feedUrl = `${API_URL}/api/export/calendar.ics`;
// webcal:// — календарь не скачивает файл один раз, а подписывается и сам его обновляет
const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');

/**
 * Подписка на задания в приложении-календаре (раздел 13 ТЗ, этап 6). В фид идут
 * подтверждённые задания со сроком; «Входящие» и архив — нет.
 */
export function CalendarSubscribe() {
  async function copy() {
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать', { description: feedUrl });
    }
  }

  return (
    <details className="rounded-xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800">
      <summary className="cursor-pointer font-medium select-none">
        Задания в календаре телефона или компьютера
      </summary>
      <div className="mt-3 space-y-3 text-zinc-600 dark:text-zinc-400">
        <p>
          Подпишись на ленту заданий — календарь будет сам подтягивать новые сроки. Попадают задания
          со сроком, кроме тех, что ещё во «Входящих».
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={webcalUrl}
            className={`${ghostButton} border border-zinc-300 dark:border-zinc-700`}
          >
            Подписаться в Календаре
          </a>
          <button
            type="button"
            onClick={() => void copy()}
            className={`${ghostButton} border border-zinc-300 dark:border-zinc-700`}
          >
            Скопировать ссылку
          </button>
          <a
            href={`${API_URL}/api/export/tasks.csv`}
            className={`${ghostButton} border border-zinc-300 dark:border-zinc-700`}
          >
            Скачать CSV
          </a>
        </div>
        <p className="text-xs text-zinc-500">
          Пока сервер работает на этом компьютере, подписка работает в календаре на нём же (на Mac —
          «Календарь»). Телефону и Google Календарю нужен сервер, доступный из интернета, — это
          после деплоя.
        </p>
      </div>
    </details>
  );
}

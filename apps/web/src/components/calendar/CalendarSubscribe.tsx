'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ghostButton } from '@/components/ui';
import { API_URL, api, apiHeaders, describeError } from '@/lib/api';

const outlined = `${ghostButton} border border-zinc-300 dark:border-zinc-700`;
const isLocal = /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(API_URL);

/**
 * Подписка на задания в приложении-календаре. В ленту идут подтверждённые задания со сроком;
 * «Входящие» и архив — нет. Если сервер закрыт ключом, в ссылке — отдельный ключ ленты:
 * он открывает только её, не остальной API.
 */
export function CalendarSubscribe() {
  const [feedUrl, setFeedUrl] = useState<string | null>(null);

  async function loadFeedUrl() {
    if (feedUrl) return;
    try {
      const { token } = await api.getCalendarFeed();
      setFeedUrl(
        `${API_URL}/api/export/calendar.ics${token ? `?token=${encodeURIComponent(token)}` : ''}`,
      );
    } catch (error) {
      toast.error('Не удалось получить ссылку на ленту', { description: describeError(error) });
    }
  }

  async function copy() {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      toast.success('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать', { description: feedUrl });
    }
  }

  // CSV — запросом с ключом доступа: простая ссылка заголовок не передаст
  async function downloadCsv() {
    try {
      const res = await fetch(`${API_URL}/api/export/tasks.csv`, { headers: apiHeaders() });
      if (!res.ok) throw new Error(`Сервер ответил ${res.status}`);
      const url = URL.createObjectURL(await res.blob());
      const link = Object.assign(document.createElement('a'), {
        href: url,
        download: 'nakanune-tasks.csv',
      });
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Не удалось скачать CSV', { description: describeError(error) });
    }
  }

  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void loadFeedUrl();
      }}
      className="rounded-xl border border-zinc-200 px-4 py-3 text-sm dark:border-zinc-800"
    >
      <summary className="cursor-pointer font-medium select-none">
        Задания в календаре телефона или компьютера
      </summary>
      <div className="mt-3 space-y-3 text-zinc-600 dark:text-zinc-400">
        <p>
          Подпишись на ленту заданий — календарь будет сам подтягивать новые сроки. Попадают задания
          со сроком, кроме тех, что ещё во «Входящих».
        </p>
        <div className="flex flex-wrap gap-2">
          {/* webcal:// — календарь подписывается и сам обновляет ленту */}
          <a
            href={feedUrl ? feedUrl.replace(/^https?:\/\//, 'webcal://') : undefined}
            aria-disabled={!feedUrl}
            className={`${outlined} ${feedUrl ? '' : 'pointer-events-none opacity-40'}`}
          >
            Подписаться в Календаре
          </a>
          <button
            type="button"
            onClick={() => void copy()}
            disabled={!feedUrl}
            className={outlined}
          >
            Скопировать ссылку
          </button>
          <button type="button" onClick={() => void downloadCsv()} className={outlined}>
            Скачать CSV
          </button>
        </div>
        <p className="text-xs text-zinc-500">
          {isLocal
            ? 'Пока сервер на этом компьютере, подписка работает в календаре на нём же. Для телефона и Google Календаря сервер должен быть доступен из интернета (ngrok).'
            : 'Ссылку можно добавить в Google Календарь («Добавить календарь → По URL») и на телефон. В ней ключ только для ленты — не публикуй её.'}
        </p>
      </div>
    </details>
  );
}

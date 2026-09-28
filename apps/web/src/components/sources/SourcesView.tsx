'use client';

import { type SourceDto, type SourceSyncResult, inMinsk } from '@nakanune/shared';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { TelegramPanel } from '@/components/sources/TelegramPanel';
import { card, field, ghostButton, primaryButton } from '@/components/ui';
import { api, describeError } from '@/lib/api';
import { useTasksStore } from '@/store/tasks';

const TYPE_LABELS: Record<SourceDto['type'], string> = {
  MOODLE_ICS: 'Календарь Moodle',
  TELEGRAM: 'Telegram',
  MMF_SCHEDULE: 'Расписание пар',
  MANUAL: 'Вставленный текст',
};

/** Итог синхронизации для тоста: «Новых заданий: 3, перенесённых: 1». */
function describeSync(sync: SourceSyncResult): string {
  if (sync.status === 'unchanged') return 'Ничего не изменилось';
  if (sync.status === 'failed') return sync.error;
  if (sync.created === 0 && sync.updated === 0) return 'Новых заданий нет';
  return [
    sync.created > 0 && `новых заданий: ${sync.created}`,
    sync.updated > 0 && `перенесённых сроков: ${sync.updated}`,
  ]
    .filter(Boolean)
    .join(', ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

/**
 * «Источники» — откуда приходят задания: календарь Moodle (сроки заданий и тестов),
 * расписание пар, потом Telegram. Сервер проверяет их сам раз в час.
 */
export function SourcesView() {
  const reloadTasks = useTasksStore((s) => s.reloadTasks);
  const [sources, setSources] = useState<SourceDto[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    // Ушли со страницы раньше, чем пришёл ответ, — состояние уже не нужно
    let cancelled = false;
    api.getSources().then(
      (list) => {
        if (!cancelled) setSources(list);
      },
      (error: unknown) => {
        toast.error('Не удалось загрузить источники', { description: describeError(error) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  function replace(source: SourceDto) {
    setSources((list) => list?.map((item) => (item.id === source.id ? source : item)) ?? null);
  }

  async function sync(id: string) {
    setBusyId(id);
    try {
      const result = await api.syncSource(id);
      replace(result.source);
      if (result.sync.status === 'failed')
        toast.error('Не удалось обновить', { description: result.sync.error });
      else toast.success(describeSync(result.sync));
      await reloadTasks();
    } catch (error) {
      toast.error('Не удалось обновить', { description: describeError(error) });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(source: SourceDto) {
    if (!confirm(`Удалить источник «${source.title}»? Задания из него останутся.`)) return;
    setBusyId(source.id);
    try {
      await api.deleteSource(source.id);
      setSources((list) => list?.filter((item) => item.id !== source.id) ?? null);
      await reloadTasks();
    } catch (error) {
      toast.error('Не удалось удалить', { description: describeError(error) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Источники</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          Откуда приходят задания
        </h2>
        {sources === null ? (
          <p className="text-sm text-zinc-500">Загружаю…</p>
        ) : sources.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Источников пока нет — добавь календарь Moodle ниже.
          </p>
        ) : (
          <ul className="space-y-2">
            {sources.map((source) => (
              <li key={source.id} className={`${card} flex flex-wrap items-start gap-3 p-4`}>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium">
                    {source.title}{' '}
                    <span className="text-sm font-normal text-zinc-500">
                      · {TYPE_LABELS[source.type]}
                      {source.detail && ` · ${source.detail}`}
                    </span>
                  </p>
                  <p className="text-sm text-zinc-500">
                    {source.lastCheckedAt
                      ? `Проверено ${format(source.lastCheckedAt, 'd MMMM, HH:mm', { locale: ru, in: inMinsk })}`
                      : 'Ещё не проверялся'}
                    {source.type !== 'MMF_SCHEDULE' && ` · заданий: ${source.taskCount}`}
                  </p>
                  {source.lastError && (
                    <p className="text-sm text-red-700 dark:text-red-400">{source.lastError}</p>
                  )}
                </div>
                {(source.type === 'MOODLE_ICS' || source.type === 'TELEGRAM') && (
                  <div className="flex gap-1 text-sm">
                    <button
                      type="button"
                      onClick={() => void sync(source.id)}
                      disabled={busyId === source.id}
                      className={ghostButton}
                    >
                      {busyId === source.id ? 'Обновляю…' : 'Обновить сейчас'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(source)}
                      disabled={busyId === source.id}
                      className={ghostButton}
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-zinc-500">
          Сервер сам проверяет календари и чаты раз в час, а расписание пар — раз в сутки и при
          открытии.
        </p>
      </section>

      <TelegramPanel
        onAdded={async (source, syncResult) => {
          setSources((list) => [...(list ?? []), source]);
          toast.success(`Чат «${source.title}» добавлен`, {
            description: describeSync(syncResult),
          });
          await reloadTasks();
        }}
      />

      <AddMoodleForm
        onAdded={async (source, syncResult) => {
          setSources((list) => [...(list ?? []), source]);
          toast.success('Календарь Moodle добавлен', { description: describeSync(syncResult) });
          await reloadTasks();
        }}
      />
    </div>
  );
}

function AddMoodleForm({
  onAdded,
}: {
  onAdded: (source: SourceDto, sync: SourceSyncResult) => Promise<void>;
}) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    try {
      const result = await api.addSource({ type: 'MOODLE_ICS', url: url.trim() });
      setUrl('');
      await onAdded(result.source, result.sync);
    } catch (error) {
      toast.error('Не удалось добавить календарь', { description: describeError(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={`${card} space-y-3 p-4`}>
      <h2 className="font-medium">Добавить календарь Moodle</h2>
      <ol className="list-decimal space-y-0.5 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
        <li>
          Открой{' '}
          <a
            href="https://edummf.bsu.by/calendar/export.php"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            edummf.bsu.by → Календарь → Экспорт календаря
          </a>
          .
        </li>
        <li>Выбери «Все события» и «Недавние и следующие 60 дней».</li>
        <li>Нажми «Получить URL календаря» и вставь ссылку сюда.</li>
      </ol>
      <p className="text-xs text-zinc-500">
        В ссылке твой личный токен: сервер хранит её зашифрованной и никому не показывает. Никуда
        больше её не отправляй.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://edummf.bsu.by/calendar/export_execute.php?…"
          autoComplete="off"
          spellCheck={false}
          aria-label="Ссылка на календарь Moodle"
          className={`${field} min-w-0 flex-1`}
        />
        <button type="submit" disabled={busy || !url.trim()} className={primaryButton}>
          {busy ? 'Проверяю…' : 'Добавить'}
        </button>
      </div>
    </form>
  );
}

'use client';

import type { ExtractResult } from '@nakanune/shared';
import { useState } from 'react';
import { ghostButton } from '@/components/ui';
import { useNow } from '@/lib/useNow';
import { useTasksStore } from '@/store/tasks';
import { InboxCard } from './InboxCard';
import { PasteForm } from './PasteForm';

/**
 * «Входящие» — задания, которые надо проверить: из вставленного текста, а позже — из
 * Telegram и Moodle, если ИИ не уверен. Основа — экран извлечения из StudyPlan.
 */
export function InboxView() {
  const tasks = useTasksStore((s) => s.tasks);
  const subjects = useTasksStore((s) => s.subjects);
  const acceptTasks = useTasksStore((s) => s.acceptTasks);
  const now = useNow();
  const [lastResult, setLastResult] = useState<ExtractResult | null>(null);

  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  // Свежие сверху — только что вставленное проверяют первым
  const inbox = tasks
    .filter((task) => task.status === 'INBOX' && !task.archived)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Входящие</h1>
      <PasteForm onResult={setLastResult} />

      {lastResult && <ResultLine result={lastResult} />}
      {lastResult?.notice && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {lastResult.notice}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
          На проверку <span className="font-normal text-zinc-400">{inbox.length}</span>
        </h2>
        {inbox.length > 1 && (
          <button
            type="button"
            onClick={() => void acceptTasks(inbox.map((task) => task.id))}
            className={`${ghostButton} text-sm`}
          >
            Принять все ({inbox.length})
          </button>
        )}
      </div>

      {inbox.length === 0 ? (
        <p className="py-8 text-center text-zinc-500">
          Проверять нечего. Вставь сообщение из чата группы — найденные задания появятся здесь.
        </p>
      ) : (
        <div className="space-y-3">
          {inbox.map((task) => (
            <InboxCard
              key={task.id}
              task={task}
              subject={task.subjectId ? subjectsById.get(task.subjectId) : undefined}
              now={now}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Чем разобран текст и сколько сообщений было новыми: «ИИ (gemini-2.5-flash) · сообщений 6, уже разбирались 2». */
function ResultLine({ result }: { result: ExtractResult }) {
  const { total, skipped } = result.messages;
  const parts = [
    result.engine === 'gemini'
      ? `Разобрал ИИ (${result.model})`
      : result.engine === 'heuristic'
        ? 'Разобрано без ИИ'
        : null,
    total > 1 ? `сообщений ${total}` : null,
    skipped > 0 && skipped < total ? `уже разбирались ${skipped}` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="text-xs text-zinc-500">{parts.join(' · ')}</p>;
}

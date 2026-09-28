'use client';

import { useState } from 'react';
import { ghostButton } from '@/components/ui';
import { groupByDeadline, groupBySubject } from '@/lib/grouping';
import { useNow } from '@/lib/useNow';
import { useTasksStore } from '@/store/tasks';
import { DaySummary } from './DaySummary';
import { QuickAddForm } from './QuickAddForm';
import { TaskItem } from './TaskItem';
import { WorkloadAlerts } from './WorkloadAlerts';

type View = 'deadline' | 'subject';

export function TasksView() {
  const tasks = useTasksStore((s) => s.tasks);
  const subjects = useTasksStore((s) => s.subjects);
  const status = useTasksStore((s) => s.status);
  const now = useNow();

  const [view, setView] = useState<View>('deadline');
  const [showArchive, setShowArchive] = useState(false);
  const [label, setLabel] = useState<string | null>(null);

  if (tasks.length === 0 && status !== 'ready') {
    return (
      <p className="text-zinc-500">
        {status === 'error'
          ? 'Не удалось загрузить задания — сервер не отвечает.'
          : 'Загружаю задания…'}
      </p>
    );
  }

  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  // «Входящие» (задания, которые ещё надо проверить) получат свою вкладку на Этапе 3
  const confirmed = tasks.filter((task) => task.status !== 'INBOX');
  const active = confirmed.filter((task) => !task.archived);
  const archived = confirmed.filter((task) => task.archived);
  const shown = (showArchive ? archived : active).filter(
    (task) => !label || task.labels.includes(label),
  );
  const groups =
    view === 'deadline' ? groupByDeadline(shown, now) : groupBySubject(shown, subjects);

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Задания</h1>
      <DaySummary tasks={active} subjects={subjects} now={now} />
      <QuickAddForm />
      <WorkloadAlerts tasks={active} now={now} />

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900" role="group">
          {(
            [
              ['deadline', 'По срокам'],
              ['subject', 'По предметам'],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              type="button"
              onClick={() => setView(value)}
              aria-pressed={view === value}
              className={`rounded-md px-3 py-1 ${
                view === value
                  ? 'bg-white shadow-sm dark:bg-zinc-700'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        {label && (
          <button
            type="button"
            onClick={() => setLabel(null)}
            className="rounded-full bg-zinc-900 px-3 py-1 text-white dark:bg-zinc-100 dark:text-zinc-900"
            title="Сбросить фильтр"
          >
            #{label} ×
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowArchive((value) => !value)}
          aria-pressed={showArchive}
          className={`${ghostButton} ml-auto`}
        >
          {showArchive ? '← К заданиям' : `Архив (${archived.length})`}
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="py-8 text-center text-zinc-500">
          {showArchive
            ? 'В архиве пусто.'
            : label
              ? `Нет заданий с меткой #${label}.`
              : 'Заданий пока нет — добавь первое выше. Скоро они будут приходить сами из Telegram и Moodle.'}
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.key}>
            <h2
              className={`flex items-center gap-2 px-2 text-sm font-medium ${
                group.tone === 'danger'
                  ? 'text-red-600 dark:text-red-400'
                  : group.tone === 'muted'
                    ? 'text-zinc-400'
                    : 'text-zinc-600 dark:text-zinc-300'
              }`}
            >
              {group.color && (
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: group.color }}
                  aria-hidden
                />
              )}
              {group.title}
              <span className="font-normal text-zinc-400">{group.tasks.length}</span>
            </h2>
            <ul className="mt-1">
              {group.tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  subject={task.subjectId ? subjectsById.get(task.subjectId) : undefined}
                  now={now}
                  onLabelClick={setLabel}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

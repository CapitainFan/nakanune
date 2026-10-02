'use client';

// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: js/app.js — renderExtraction: карточка найденного задания с полосой уверенности
// (зелёная от 75) и правкой на месте. Предмет там подбирался как name.includes(subject_name):
// пустое имя совпадало с первым же предметом, а «не нашёлся» превращался в subjects[3].
import {
  AUTO_ACCEPT_CONFIDENCE,
  labelColor,
  type SubjectDto,
  type TaskDto,
} from '@nakanune/shared';
import { useState } from 'react';
import { TaskDescription } from '@/components/tasks/TaskDescription';
import { TaskEditForm } from '@/components/tasks/TaskEditForm';
import { badge, card, ghostButton, primaryButton } from '@/components/ui';
import { formatDue } from '@/lib/format';
import { useTasksStore } from '@/store/tasks';

type Props = { task: TaskDto; subject: SubjectDto | undefined; now: Date };

export function InboxCard({ task, subject, now }: Props) {
  const [editing, setEditing] = useState(false);
  const acceptTasks = useTasksStore((s) => s.acceptTasks);
  const deleteTask = useTasksStore((s) => s.deleteTask);

  if (editing) return <TaskEditForm task={task} onClose={() => setEditing(false)} />;

  const confident = task.confidenceScore >= AUTO_ACCEPT_CONFIDENCE;

  return (
    <article className={`${card} space-y-3 p-4`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`${badge} bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300`}>
          {subject ? (
            <>
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: subject.color }}
                aria-hidden
              />
              {subject.name}
            </>
          ) : (
            'Без предмета'
          )}
        </span>
        <span
          className={`${badge} ${
            task.dueAt
              ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
          }`}
          title={
            task.dueAtIsGuess
              ? 'Срок примерный: в сообщении его не было — поставлен к следующей практике или взят из вопроса. Проверь'
              : undefined
          }
        >
          {task.dueAt
            ? `${task.dueAtIsGuess ? '≈ ' : ''}${formatDue(task.dueAt, now)}`
            : 'срок не найден'}
        </span>
        {task.priority === 'high' && (
          <span className="text-amber-700 dark:text-amber-400">важное</span>
        )}
        {task.labels.map((label) => (
          <span
            key={label}
            className="rounded-full px-2 py-0.5 font-medium text-white"
            style={{ backgroundColor: labelColor(label) }}
          >
            #{label}
          </span>
        ))}
      </div>

      <div>
        <h3 className="font-medium">{task.title}</h3>
        {task.summary && (
          <p className="mt-1 text-sm whitespace-pre-line text-zinc-500">{task.summary}</p>
        )}
        {task.description && (
          <TaskDescription text={task.description} className="mt-1 text-sm text-zinc-500" />
        )}
      </div>

      {task.origin && (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500 select-none">
            Исходный текст · {task.origin.sourceTitle}
          </summary>
          <p className="mt-2 border-l-2 border-zinc-200 pl-3 whitespace-pre-line text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
            {task.origin.text}
          </p>
        </details>
      )}

      {/* Полоса уверенности — как в StudyPlan: зелёная от порога автопринятия */}
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className={`h-full rounded-full ${confident ? 'bg-emerald-500' : 'bg-amber-500'}`}
            style={{ width: `${task.confidenceScore}%` }}
          />
        </div>
        <span className="tabular-nums">уверенность {task.confidenceScore}%</span>
      </div>

      <div className="flex flex-wrap justify-end gap-2 text-sm">
        <button type="button" onClick={() => void deleteTask(task.id)} className={ghostButton}>
          Отклонить
        </button>
        <button type="button" onClick={() => setEditing(true)} className={ghostButton}>
          Изменить
        </button>
        <button type="button" onClick={() => void acceptTasks([task.id])} className={primaryButton}>
          Принять
        </button>
      </div>
    </article>
  );
}

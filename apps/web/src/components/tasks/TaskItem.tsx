'use client';

// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: js/app.js — разметка задания и форма редактирования в renderTasks.
// Там строки собирались в innerHTML без экранирования (XSS, баг №7); React экранирует сам.
import {
  PRIORITY_LABELS,
  extractLabels,
  fromMinskInputValue,
  labelColor,
  toMinskInputValue,
  type Priority,
  type SubjectDto,
  type TaskDto,
} from '@nakanune/shared';
import { useState, type FormEvent } from 'react';
import { badge, field, ghostButton, primaryButton } from '@/components/ui';
import { formatDue } from '@/lib/format';
import { useTasksStore } from '@/store/tasks';
import { SubjectSelect } from './SubjectSelect';

type Props = {
  task: TaskDto;
  subject: SubjectDto | undefined;
  now: Date;
  onLabelClick?: (label: string) => void;
};

export function TaskItem({ task, subject, now, onLabelClick }: Props) {
  const [editing, setEditing] = useState(false);
  const toggleTaskStatus = useTasksStore((s) => s.toggleTaskStatus);
  const archiveTask = useTasksStore((s) => s.archiveTask);
  const restoreTask = useTasksStore((s) => s.restoreTask);
  const deleteTask = useTasksStore((s) => s.deleteTask);

  if (editing) return <TaskEditForm task={task} onClose={() => setEditing(false)} />;

  const done = task.status === 'DONE';
  const overdue = !done && task.dueAt !== null && Date.parse(task.dueAt) < now.getTime();
  const important = !done && task.priority === 'high';

  function remove() {
    if (window.confirm(`Удалить «${task.title}» насовсем?`)) void deleteTask(task.id);
  }

  return (
    <li className="group relative flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-zinc-50 dark:hover:bg-zinc-900/60">
      <input
        type="checkbox"
        checked={done}
        onChange={() => void toggleTaskStatus(task.id)}
        aria-label={done ? 'Вернуть в работу' : 'Отметить сделанным'}
        className="mt-1 size-4 shrink-0 accent-emerald-600"
      />

      <div className="min-w-0 flex-1">
        <p className={done ? 'text-zinc-400 line-through' : ''}>{task.title}</p>

        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
          {task.dueAt && (
            <span
              className={`${badge} ${
                overdue
                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  : important
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
              title={task.dueAtIsGuess ? 'Срок примерный' : undefined}
            >
              {task.dueAtIsGuess && '≈ '}
              {formatDue(task.dueAt, now)}
            </span>
          )}
          {subject && (
            <span
              className={`${badge} bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300`}
              title={subject.name}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: subject.color }}
                aria-hidden
              />
              {subject.shortCode ?? subject.name}
            </span>
          )}
          {important && <span className="text-amber-700 dark:text-amber-400">важное</span>}
          {task.labels.map((label) => (
            <button
              key={label}
              type="button"
              onClick={() => onLabelClick?.(label)}
              className="rounded-full px-2 py-0.5 font-medium text-white"
              style={{ backgroundColor: labelColor(label) }}
              title="Показать задания с этой меткой"
            >
              #{label}
            </button>
          ))}
        </div>

        {task.summary && <p className="mt-1.5 text-sm text-zinc-500">{task.summary}</p>}
        {task.notes && <p className="mt-1.5 text-sm text-zinc-500">{task.notes}</p>}
      </div>

      {/* Действия — плавающей панелью поверх задания: места в вёрстке не занимают (в узкой
          колонке календаря название не ломается). Видны при наведении и когда фокус внутри
          задания — с клавиатуры Tab на чекбокс показывает панель, следующий Tab попадает в неё. */}
      <div className="absolute top-1.5 right-1.5 hidden gap-0.5 rounded-lg bg-white p-0.5 text-xs shadow-sm ring-1 ring-zinc-200 group-focus-within:flex group-hover:flex dark:bg-zinc-900 dark:ring-zinc-700">
        <button type="button" onClick={() => setEditing(true)} className={ghostButton}>
          Изменить
        </button>
        {task.archived ? (
          <button type="button" onClick={() => void restoreTask(task.id)} className={ghostButton}>
            Вернуть
          </button>
        ) : (
          <button type="button" onClick={() => void archiveTask(task.id)} className={ghostButton}>
            В архив
          </button>
        )}
        <button type="button" onClick={remove} className={ghostButton}>
          Удалить
        </button>
      </div>
    </li>
  );
}

function TaskEditForm({ task, onClose }: { task: TaskDto; onClose: () => void }) {
  const subjects = useTasksStore((s) => s.subjects);
  const updateTask = useTasksStore((s) => s.updateTask);

  // Метки правятся прямо в названии, как в StudyPlan: «Решить №5 #срочно»
  const [title, setTitle] = useState(() =>
    [task.title, ...task.labels.map((label) => `#${label}`)].join(' '),
  );
  const [subjectId, setSubjectId] = useState(task.subjectId ?? '');
  const initialDue = task.dueAt ? toMinskInputValue(task.dueAt) : '';
  const [due, setDue] = useState(initialDue);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority);

  function save(event: FormEvent) {
    event.preventDefault();
    const { cleanTitle, labels } = extractLabels(title);
    if (!cleanTitle) return;

    onClose(); // обновление оптимистичное — форму можно закрыть сразу
    void updateTask(task.id, {
      title: cleanTitle,
      labels,
      subjectId: subjectId || null,
      // Время в поле — минское; в StudyPlan оно было в UTC (баг №8)
      dueAt: due ? fromMinskInputValue(due) : null,
      // Срок поправил человек — он больше не примерный
      ...(due !== initialDue && { dueAtIsGuess: false }),
      notes: notes.trim() || null,
      priority,
    });
  }

  return (
    <li className="py-2">
      <form
        onSubmit={save}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
        className="space-y-2 rounded-lg border border-zinc-300 p-3 dark:border-zinc-700"
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          aria-label="Название и метки"
          className={`${field} w-full font-medium`}
          autoFocus
        />
        <div className="grid gap-2 sm:grid-cols-3">
          <SubjectSelect value={subjectId} onChange={setSubjectId} subjects={subjects} />
          <input
            type="datetime-local"
            value={due}
            onChange={(event) => setDue(event.target.value)}
            aria-label="Срок"
            className={field}
          />
          <select
            value={priority}
            onChange={(event) => setPriority(event.target.value as Priority)}
            aria-label="Приоритет"
            className={field}
          >
            {(Object.keys(PRIORITY_LABELS) as Priority[]).map((value) => (
              <option key={value} value={value}>
                Приоритет: {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <input
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Заметки"
          aria-label="Заметки"
          className={`${field} w-full`}
        />
        <div className="flex justify-end gap-2 text-sm">
          <button type="button" onClick={onClose} className={ghostButton}>
            Отмена
          </button>
          <button type="submit" className={primaryButton}>
            Сохранить
          </button>
        </div>
      </form>
    </li>
  );
}

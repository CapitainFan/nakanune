'use client';

// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: js/app.js — форма редактирования задания (renderTasks) и черновика (renderExtraction).
import {
  PRIORITY_LABELS,
  extractLabels,
  fromMinskInputValue,
  toMinskInputValue,
  type Priority,
  type TaskDto,
} from '@nakanune/shared';
import { useState, type FormEvent } from 'react';
import { field, ghostButton, primaryButton } from '@/components/ui';
import { useTasksStore } from '@/store/tasks';
import { SubjectSelect } from './SubjectSelect';

/** Правка задания на месте — в списке, в календаре и во «Входящих». */
export function TaskEditForm({ task, onClose }: { task: TaskDto; onClose: () => void }) {
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
  );
}

'use client';

import { extractLabels, fromMinskInputValue } from '@nakanune/shared';
import { useState, type FormEvent } from 'react';
import { card, field, primaryButton } from '@/components/ui';
import { useTasksStore } from '@/store/tasks';
import { SubjectSelect } from './SubjectSelect';

/** Быстрое добавление руками. Вставка текста с разбором через ИИ — на Этапе 3. */
export function QuickAddForm() {
  const subjects = useTasksStore((s) => s.subjects);
  const addTasks = useTasksStore((s) => s.addTasks);
  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [due, setDue] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { cleanTitle, labels } = extractLabels(title);
    if (!cleanTitle) return;

    setSaving(true);
    const added = await addTasks([
      {
        title: cleanTitle,
        labels,
        subjectId: subjectId || null,
        dueAt: due ? fromMinskInputValue(due) : null,
      },
    ]);
    setSaving(false);
    // Предмет оставляем: часто добавляют несколько заданий по одному предмету подряд
    if (added) {
      setTitle('');
      setDue('');
    }
  }

  return (
    <form onSubmit={submit} className={`${card} flex flex-col gap-2 p-3 md:flex-row`}>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Что задали? Например: Решить №5–10 #кр"
        aria-label="Задание"
        className={`${field} min-w-0 flex-1`}
      />
      <SubjectSelect
        value={subjectId}
        onChange={setSubjectId}
        subjects={subjects}
        className="md:w-48"
      />
      <input
        type="datetime-local"
        value={due}
        onChange={(event) => setDue(event.target.value)}
        aria-label="Срок"
        className={field}
      />
      <button type="submit" disabled={saving || !title.trim()} className={primaryButton}>
        Добавить
      </button>
    </form>
  );
}

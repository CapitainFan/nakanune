'use client';

import { toMinskDateKey, type TaskDto } from '@nakanune/shared';
import { useState } from 'react';
import { useNow } from '@/lib/useNow';
import { useTasksStore } from '@/store/tasks';
import { CalendarSubscribe } from './CalendarSubscribe';
import { DayPanel } from './DayPanel';
import { MonthGrid } from './MonthGrid';

export function CalendarView() {
  const tasks = useTasksStore((s) => s.tasks);
  const subjects = useTasksStore((s) => s.subjects);
  const now = useNow();
  const today = toMinskDateKey(now);

  const [month, setMonth] = useState(() => new Date());
  const [selected, setSelected] = useState(today);

  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  // Точки в сетке — только то, что ещё надо сдать (как в StudyPlan)
  const tasksByDay = new Map<string, TaskDto[]>();
  for (const task of tasks) {
    if (task.status !== 'TODO' || task.archived || !task.dueAt) continue;
    const key = toMinskDateKey(task.dueAt);
    tasksByDay.set(key, [...(tasksByDay.get(key) ?? []), task]);
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="space-y-4">
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={setSelected}
          today={today}
          tasksByDay={tasksByDay}
          subjectsById={subjectsById}
        />
        <CalendarSubscribe />
      </div>
      <DayPanel dateKey={selected} now={now} subjectsById={subjectsById} />
    </div>
  );
}

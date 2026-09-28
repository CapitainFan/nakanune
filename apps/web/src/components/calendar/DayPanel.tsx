'use client';

import {
  classesOn,
  fromMinskDateKey,
  inMinsk,
  toMinskDateKey,
  weekParityOf,
  type SubjectDto,
} from '@nakanune/shared';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { ClassList } from '@/components/schedule/ClassList';
import { ScheduleStatus } from '@/components/schedule/ScheduleStatus';
import { TaskItem } from '@/components/tasks/TaskItem';
import { WorkloadAlerts } from '@/components/tasks/WorkloadAlerts';
import { card, ghostButton } from '@/components/ui';
import { useScheduleStore } from '@/store/schedule';
import { useTasksStore } from '@/store/tasks';

type Props = { dateKey: string; now: Date; subjectsById: Map<string, SubjectDto> };

/** Выбранный день: пары по расписанию и что сдать к этому дню. */
export function DayPanel({ dateKey, now, subjectsById }: Props) {
  const tasks = useTasksStore((s) => s.tasks);
  const markDayDone = useTasksStore((s) => s.markPendingTasksForDateCompleted);
  const schedule = useScheduleStore((s) => s.schedule);

  const date = fromMinskDateKey(dateKey);
  const active = tasks.filter((task) => task.status !== 'INBOX' && !task.archived);
  const dayTasks = active.filter((task) => task.dueAt && toMinskDateKey(task.dueAt) === dateKey);
  const pendingCount = dayTasks.filter((task) => task.status === 'TODO').length;

  const source = schedule?.source;
  const classes = source ? classesOn(schedule.classes, date, source.firstWeekDate) : [];

  return (
    <section className={`${card} space-y-5 p-4`}>
      <header>
        <h2 className="text-lg font-semibold first-letter:uppercase">
          {format(date, 'EEEE, d MMMM', { locale: ru, in: inMinsk })}
        </h2>
        {source && (
          <p className="text-sm text-zinc-500">
            {weekParityOf(date, source.firstWeekDate)}-я неделя
          </p>
        )}
      </header>

      <div>
        <h3 className="mb-2 text-sm font-medium text-zinc-500">Пары</h3>
        {!schedule ? (
          <p className="text-sm text-zinc-500">Загружаю расписание…</p>
        ) : !source ? (
          <p className="text-sm text-zinc-500">Расписание пар не настроено.</p>
        ) : classes.length === 0 ? (
          <p className="text-sm text-zinc-500">Пар нет</p>
        ) : (
          <ClassList classes={classes} subjectsById={subjectsById} />
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
          <h3 className="font-medium text-zinc-500">Сдать</h3>
          {pendingCount > 0 && (
            <button type="button" onClick={() => void markDayDone(dateKey)} className={ghostButton}>
              Отметить все ({pendingCount})
            </button>
          )}
        </div>
        {dayTasks.length === 0 ? (
          <p className="text-sm text-zinc-500">Ничего сдавать не нужно</p>
        ) : (
          <ul>
            {dayTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                subject={task.subjectId ? subjectsById.get(task.subjectId) : undefined}
                now={now}
              />
            ))}
          </ul>
        )}
      </div>

      <WorkloadAlerts tasks={active} now={now} date={dateKey} />
      <ScheduleStatus />
    </section>
  );
}

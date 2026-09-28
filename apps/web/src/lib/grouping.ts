// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: js/app.js — renderTasks (группы «Due soon», «This week», «Completed»).
import { inMinsk, type SubjectDto, type TaskDto } from '@nakanune/shared';
import { differenceInCalendarDays } from 'date-fns';

export type TaskGroup = {
  key: string;
  title: string;
  tasks: TaskDto[];
  tone?: 'danger' | 'muted';
  color?: string; // цвет предмета — у групп по предметам
};

/** Сначала ближайшие сроки, без срока — в конце (так же сортирует сервер). */
export function compareTasks(a: TaskDto, b: TaskDto): number {
  if (a.dueAt !== b.dueAt) {
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    // Сравниваем моменты времени, а не строки: у «…Z» и «…+03:00» разный вид
    return Date.parse(a.dueAt) - Date.parse(b.dueAt);
  }
  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Группы по сроку, дни — по Минску. В StudyPlan групп было три, и в них путались:
 * задание без срока давало NaN дней и попадало в «This week», просроченное (дни < 0) —
 * в «Due soon», а «This week» на деле означало «всё, что позже трёх дней».
 */
export function groupByDeadline(tasks: TaskDto[], now: Date): TaskGroup[] {
  const overdue: TaskDto[] = [];
  const soon: TaskDto[] = [];
  const week: TaskDto[] = [];
  const later: TaskDto[] = [];
  const undated: TaskDto[] = [];
  const done: TaskDto[] = [];

  for (const task of [...tasks].sort(compareTasks)) {
    if (task.status === 'DONE') done.push(task);
    else if (!task.dueAt) undated.push(task);
    else if (Date.parse(task.dueAt) < now.getTime()) overdue.push(task);
    else {
      const days = differenceInCalendarDays(task.dueAt, now, { in: inMinsk });
      if (days <= 3) soon.push(task);
      else if (days <= 7) week.push(task);
      else later.push(task);
    }
  }

  const groups: TaskGroup[] = [
    { key: 'overdue', title: 'Просрочено', tasks: overdue, tone: 'danger' },
    { key: 'soon', title: 'Ближайшие 3 дня', tasks: soon },
    { key: 'week', title: 'На этой неделе', tasks: week },
    { key: 'later', title: 'Позже', tasks: later },
    { key: 'undated', title: 'Без срока', tasks: undated },
    { key: 'done', title: 'Сделано', tasks: done, tone: 'muted' },
  ];
  return groups.filter((group) => group.tasks.length > 0);
}

/** Группы по предметам (по алфавиту, «Без предмета» — в конце); сделанное — отдельной группой. */
export function groupBySubject(tasks: TaskDto[], subjects: SubjectDto[]): TaskGroup[] {
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));
  const bySubject = new Map<string, TaskGroup>();
  const done: TaskDto[] = [];

  for (const task of [...tasks].sort(compareTasks)) {
    if (task.status === 'DONE') {
      done.push(task);
      continue;
    }
    // В StudyPlan неизвестный предмет подменялся первым из списка (баг №6)
    const subject = task.subjectId ? subjectsById.get(task.subjectId) : undefined;
    const key = subject?.id ?? 'none';
    const group = bySubject.get(key) ?? {
      key,
      title: subject?.name ?? 'Без предмета',
      color: subject?.color,
      tasks: [],
    };
    group.tasks.push(task);
    bySubject.set(key, group);
  }

  const groups = [...bySubject.values()].sort((a, b) => {
    if (a.key === 'none') return 1;
    if (b.key === 'none') return -1;
    return a.title.localeCompare(b.title, 'ru');
  });
  if (done.length > 0) groups.push({ key: 'done', title: 'Сделано', tasks: done, tone: 'muted' });
  return groups;
}

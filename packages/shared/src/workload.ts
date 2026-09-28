// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: js/utils/scheduler.js — analyzeWorkload.
import { subDays } from 'date-fns';
import type { TaskDto } from './schemas/task';
import { inMinsk, toMinskDateKey } from './time';

type WorkloadTask = Pick<TaskDto, 'id' | 'dueAt' | 'status' | 'archived' | 'priority'>;

export type WorkloadSuggestion =
  /** Начать это задание заранее. */
  | { type: 'start-early'; taskId: string }
  /** Сделать задание попроще накануне — за день до перегруженного дня. */
  | { type: 'do-day-before'; taskId: string; date: string }
  /** Несколько важных заданий — разбить их на части. */
  | { type: 'split' };

export type WorkloadDay = {
  date: string; // YYYY-MM-DD по Минску
  score: number;
  level: 'medium' | 'high';
  taskIds: string[];
  suggestions: WorkloadSuggestion[];
};

// Веса из StudyPlan: каждое задание +2, важное ещё +3; перегрузка — от 8, сильная — от 12
const TASK_WEIGHT = 2;
const HIGH_PRIORITY_WEIGHT = 3;
const HEAVY_FROM = 8;
const VERY_HEAVY_FROM = 12;

/**
 * Находит перегруженные дни среди предстоящих заданий.
 * В StudyPlan дни группировались по строке вида «Mon, Sep 28» — без года и в часовом
 * поясе браузера; здесь ключ дня — YYYY-MM-DD по Минску. Совет «перенести задание на
 * следующий день» заменён на «сделать накануне»: срок сдачи ставит преподаватель.
 */
export function analyzeWorkload(tasks: WorkloadTask[], now: Date = new Date()): WorkloadDay[] {
  const today = toMinskDateKey(now);
  const byDay = new Map<string, WorkloadTask[]>();

  for (const task of tasks) {
    if (!task.dueAt || task.archived || task.status === 'DONE') continue;
    const day = toMinskDateKey(task.dueAt);
    if (day < today) continue; // прошедшие дни уже не разгрузить
    byDay.set(day, [...(byDay.get(day) ?? []), task]);
  }

  const result: WorkloadDay[] = [];
  for (const [date, dayTasks] of [...byDay].sort(([a], [b]) => a.localeCompare(b))) {
    const important = dayTasks.filter((task) => task.priority === 'high');
    const score = dayTasks.length * TASK_WEIGHT + important.length * HIGH_PRIORITY_WEIGHT;
    if (score < HEAVY_FROM) continue;

    const first = important[0] ?? dayTasks[0]!;
    const suggestions: WorkloadSuggestion[] = [{ type: 'start-early', taskId: first.id }];

    const easier = dayTasks.find((task) => task.priority !== 'high' && task.id !== first.id);
    if (dayTasks.length >= 3 && easier?.dueAt) {
      const dayBefore = toMinskDateKey(subDays(easier.dueAt, 1, { in: inMinsk }));
      suggestions.push({ type: 'do-day-before', taskId: easier.id, date: dayBefore });
    }
    if (important.length >= 2) suggestions.push({ type: 'split' });

    result.push({
      date,
      score,
      level: score >= VERY_HEAVY_FROM ? 'high' : 'medium',
      taskIds: dayTasks.map((task) => task.id),
      suggestions,
    });
  }
  return result;
}

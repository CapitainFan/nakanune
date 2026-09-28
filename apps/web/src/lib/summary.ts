// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: js/app.js — generateSummary. Там функция возвращала готовый HTML,
// здесь — данные, а вид за компонентом <DaySummary/>.
import { toMinskDateKey, type SubjectDto, type TaskDto } from '@nakanune/shared';

export type TasksSummary = {
  /** Сдать сегодня (ещё не сделано и срок не прошёл). */
  today: number;
  /** Сдать в ближайшие 7 дней. */
  week: number;
  overdue: number;
  /** По какому предмету больше всего заданий на неделе. */
  topSubject: string | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function summarize(tasks: TaskDto[], subjects: SubjectDto[], now: Date): TasksSummary {
  const today = toMinskDateKey(now);
  const subjectNames = new Map(subjects.map((subject) => [subject.id, subject.name]));
  const perSubject = new Map<string, number>();
  const summary: TasksSummary = { today: 0, week: 0, overdue: 0, topSubject: null };

  for (const task of tasks) {
    // «Входящие» ещё не подтверждены — в сводку не идут
    if (task.archived || task.status !== 'TODO' || !task.dueAt) continue;

    const due = Date.parse(task.dueAt);
    if (due < now.getTime()) {
      summary.overdue += 1;
      continue;
    }
    // «Сегодня» — по Минску, а не по часовому поясу браузера, как было в StudyPlan
    if (toMinskDateKey(task.dueAt) === today) summary.today += 1;
    if (due <= now.getTime() + WEEK_MS) {
      summary.week += 1;
      const name = (task.subjectId && subjectNames.get(task.subjectId)) || 'Без предмета';
      perSubject.set(name, (perSubject.get(name) ?? 0) + 1);
    }
  }

  // В StudyPlan «основной предмет» считался по всем заданиям, даже через месяц и просроченным
  let best = 0;
  for (const [name, count] of perSubject) {
    if (count > best) {
      best = count;
      summary.topSubject = name;
    }
  }
  return summary;
}

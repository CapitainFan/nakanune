import {
  analyzeWorkload,
  fromMinskDateKey,
  type TaskDto,
  type WorkloadSuggestion,
} from '@nakanune/shared';
import { formatDay } from '@/lib/format';

type Props = {
  tasks: TaskDto[];
  now: Date;
  /** Показать только этот день (YYYY-MM-DD) — для календаря. */
  date?: string;
};

/** Перегруженные дни и советы — перенос analyzeWorkload из StudyPlan (scheduler.js). */
export function WorkloadAlerts({ tasks, now, date }: Props) {
  const days = analyzeWorkload(tasks, now).filter((day) => !date || day.date === date);
  if (days.length === 0) return null;

  const titles = new Map(tasks.map((task) => [task.id, task.title]));
  const describe = (suggestion: WorkloadSuggestion) => {
    switch (suggestion.type) {
      case 'start-early':
        return `Начни заранее: «${titles.get(suggestion.taskId)}»`;
      case 'do-day-before':
        return `«${titles.get(suggestion.taskId)}» можно сделать накануне — ${formatDay(fromMinskDateKey(suggestion.date))}`;
      case 'split':
        return 'Несколько важных заданий сразу — разбей их на части по дням';
    }
  };

  return (
    <div className="space-y-2">
      {days.map((day) => (
        <div
          key={day.date}
          className={`rounded-xl border p-3 text-sm ${
            day.level === 'high'
              ? 'border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/40'
              : 'border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
          }`}
        >
          <p className="font-medium">
            Много заданий на {formatDay(fromMinskDateKey(day.date))}: {day.taskIds.length}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-zinc-700 dark:text-zinc-300">
            {day.suggestions.map((suggestion) => (
              <li key={suggestion.type}>{describe(suggestion)}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

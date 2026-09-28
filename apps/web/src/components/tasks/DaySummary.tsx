import type { SubjectDto, TaskDto } from '@nakanune/shared';
import { card } from '@/components/ui';
import { summarize } from '@/lib/summary';

type Props = { tasks: TaskDto[]; subjects: SubjectDto[]; now: Date };

/** Сводка «сегодня / неделя / основной предмет» — перенос generateSummary из StudyPlan. */
export function DaySummary({ tasks, subjects, now }: Props) {
  const summary = summarize(tasks, subjects, now);

  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Tile label="Сдать сегодня" value={summary.today} />
      <Tile label="За 7 дней" value={summary.week} />
      <Tile label="Просрочено" value={summary.overdue} danger={summary.overdue > 0} />
      <div className={`${card} p-3`}>
        <dt className="text-xs text-zinc-500">Больше всего заданий</dt>
        <dd className="mt-1 truncate font-medium" title={summary.topSubject ?? undefined}>
          {summary.topSubject ?? '—'}
        </dd>
      </div>
    </dl>
  );
}

function Tile({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div className={`${card} p-3`}>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd
        className={`mt-1 text-2xl font-semibold ${danger ? 'text-red-600 dark:text-red-400' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

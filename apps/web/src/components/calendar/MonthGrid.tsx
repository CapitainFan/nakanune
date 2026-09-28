// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: js/app.js — renderCalendar. Там неделя начиналась с воскресенья и месяцы были
// по-английски (баг №9), а у задания без предмета точка красилась цветом первого предмета.
import { inMinsk, toMinskDateKey, type SubjectDto, type TaskDto } from '@nakanune/shared';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import { card, ghostButton } from '@/components/ui';

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MAX_DOTS = 3;

type Props = {
  month: Date; // любой момент внутри показываемого месяца
  onMonthChange: (month: Date) => void;
  selected: string; // YYYY-MM-DD
  onSelect: (dateKey: string) => void;
  today: string;
  tasksByDay: Map<string, TaskDto[]>;
  subjectsById: Map<string, SubjectDto>;
};

export function MonthGrid(props: Props) {
  const { month, onMonthChange, selected, onSelect, today, tasksByDay, subjectsById } = props;
  const options = { weekStartsOn: 1, in: inMinsk } as const;
  const days = eachDayOfInterval(
    {
      start: startOfWeek(startOfMonth(month, options), options),
      end: endOfWeek(endOfMonth(month, options), options),
    },
    { in: inMinsk },
  );

  return (
    <section className={`${card} p-4`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold first-letter:uppercase">
          {format(month, 'LLLL yyyy', { locale: ru, in: inMinsk })}
        </h1>
        <div className="flex gap-1 text-sm">
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, -1, { in: inMinsk }))}
            aria-label="Предыдущий месяц"
            className={ghostButton}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => {
              onMonthChange(new Date());
              onSelect(today);
            }}
            className={ghostButton}
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1, { in: inMinsk }))}
            aria-label="Следующий месяц"
            className={ghostButton}
          >
            →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="py-1">
            {weekday}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = toMinskDateKey(day);
          const dayTasks = tasksByDay.get(key) ?? [];
          const isSelected = key === selected;
          const inMonth = isSameMonth(day, month, { in: inMinsk });

          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-pressed={isSelected}
              aria-label={`${format(day, 'd MMMM', { locale: ru, in: inMinsk })}, сдать: ${dayTasks.length}`}
              className={`flex h-14 flex-col items-center gap-1 rounded-lg pt-1.5 text-sm sm:h-16 ${
                isSelected
                  ? 'bg-zinc-100 ring-1 ring-zinc-400 dark:bg-zinc-800 dark:ring-zinc-500'
                  : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
              } ${inMonth ? '' : 'text-zinc-400 dark:text-zinc-600'}`}
            >
              <span
                className={`flex size-6 items-center justify-center rounded-full ${
                  key === today
                    ? 'bg-zinc-900 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : ''
                }`}
              >
                {format(day, 'd', { in: inMinsk })}
              </span>
              {dayTasks.length > 0 && (
                <span className="flex items-center gap-0.5" aria-hidden>
                  {dayTasks.slice(0, MAX_DOTS).map((task) => (
                    <span
                      key={task.id}
                      className="size-1.5 rounded-full bg-zinc-400"
                      style={{
                        backgroundColor: task.subjectId
                          ? subjectsById.get(task.subjectId)?.color
                          : undefined,
                      }}
                    />
                  ))}
                  {dayTasks.length > MAX_DOTS && (
                    <span className="text-[10px] leading-none text-zinc-500">+</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

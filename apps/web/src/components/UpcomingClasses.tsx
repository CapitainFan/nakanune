'use client';

import {
  CLASS_KIND_LABELS,
  ScheduleResponseSchema,
  SubjectSchema,
  classesOn,
  inMinsk,
  type ClassSessionDto,
  type ScheduleResponse,
  type SubjectDto,
} from '@nakanune/shared';
import { addDays, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

type Loaded = { schedule: ScheduleResponse; subjects: SubjectDto[] };

async function loadSchedule(): Promise<Loaded> {
  const [scheduleRes, subjectsRes] = await Promise.all([
    fetch(`${API_URL}/api/schedule`),
    fetch(`${API_URL}/api/subjects`),
  ]);
  if (!scheduleRes.ok || !subjectsRes.ok) throw new Error('API не ответил');
  return {
    schedule: ScheduleResponseSchema.parse(await scheduleRes.json()),
    subjects: SubjectSchema.array().parse(await subjectsRes.json()),
  };
}

/** Пары сегодня и завтра — из расписания, которое сервер берёт с сайта ММФ. */
export function UpcomingClasses() {
  const [data, setData] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const load = (attempt: number) => {
      loadSchedule()
        .then((loaded) => {
          if (cancelled) return;
          setData(loaded);
          // Сервер перепроверяет сайт в фоне — заглянем ещё раз через пару секунд
          if (loaded.schedule.refreshing && attempt === 0) retry = setTimeout(() => load(1), 3000);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
    };
    load(0);

    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, []);

  async function refresh() {
    setSyncing(true);
    try {
      await fetch(`${API_URL}/api/schedule/sync`, { method: 'POST' });
      // Синхронизация могла добавить предметы — перечитываем и их
      setData(await loadSchedule());
    } catch {
      setFailed(true);
    } finally {
      setSyncing(false);
    }
  }

  // Что сервер недоступен, уже показывает блок «Состояние»
  if (failed) return null;
  if (!data) return <p className="text-sm text-zinc-500">Загружаю расписание…</p>;

  const { schedule, subjects } = data;
  const source = schedule.source;
  if (!source) return <p className="text-sm text-zinc-500">Расписание пар не настроено.</p>;

  const now = new Date();
  const days = [
    { label: 'Сегодня', date: now },
    { label: 'Завтра', date: addDays(now, 1, { in: inMinsk }) },
  ];
  const subjectsById = new Map(subjects.map((subject) => [subject.id, subject]));

  return (
    <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-zinc-500">Пары</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={syncing}
          className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          {syncing ? 'Обновляю…' : 'Обновить'}
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        {days.map(({ label, date }) => (
          <DayClasses
            key={label}
            label={label}
            date={date}
            classes={classesOn(schedule.classes, date, source.firstWeekDate)}
            subjectsById={subjectsById}
          />
        ))}
      </div>

      <p className="mt-5 text-xs text-zinc-500">
        С{' '}
        <a
          href={source.url}
          className="underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
        >
          сайта ММФ
        </a>
        {source.lastCheckedAt &&
          ` · проверено ${format(source.lastCheckedAt, 'd MMMM, HH:mm', { locale: ru, in: inMinsk })}`}
        {schedule.refreshing && ' · проверяю, не изменилось ли…'}
      </p>
      {source.lastError && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          Не удалось обновить: {source.lastError}
        </p>
      )}
    </section>
  );
}

function DayClasses({
  label,
  date,
  classes,
  subjectsById,
}: {
  label: string;
  date: Date;
  classes: ClassSessionDto[];
  subjectsById: Map<string, SubjectDto>;
}) {
  return (
    <div>
      <h3 className="mb-3 font-medium">
        {label}
        <span className="ml-2 font-normal text-zinc-500">
          {format(date, 'EEEEEE, d MMMM', { locale: ru, in: inMinsk })}
        </span>
      </h3>
      {classes.length === 0 ? (
        <p className="text-sm text-zinc-500">Пар нет</p>
      ) : (
        <ul className="space-y-3">
          {classes.map((lesson) => {
            const subject = subjectsById.get(lesson.subjectId);
            const details = [
              lesson.kind && CLASS_KIND_LABELS[lesson.kind],
              lesson.room && `ауд. ${lesson.room}`,
            ].filter(Boolean);
            return (
              <li key={lesson.id} className="flex gap-3 text-sm">
                <span className="w-24 shrink-0 text-zinc-500 tabular-nums">
                  {lesson.startTime}–{lesson.endTime}
                </span>
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: subject?.color }}
                  aria-hidden
                />
                <span>
                  <span className="font-medium">{subject?.name ?? 'Без предмета'}</span>
                  {details.length > 0 && (
                    <span className="block text-zinc-500">{details.join(' · ')}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

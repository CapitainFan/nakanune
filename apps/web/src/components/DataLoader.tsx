'use client';

import { useEffect } from 'react';
import { useScheduleStore } from '@/store/schedule';
import { useTasksStore } from '@/store/tasks';

/** Загружает данные один раз при открытии приложения: они общие для всех вкладок. */
export function DataLoader() {
  useEffect(() => {
    // В режиме разработки React вызывает эффект дважды — второй вызов увидит, что загрузка уже идёт
    const tasks = useTasksStore.getState();
    if (tasks.status === 'idle') void tasks.fetchInitialData();

    // «Обновлять расписание при использовании»: сервер сам решит, пора ли перепроверить сайт
    const schedule = useScheduleStore.getState();
    if (schedule.status === 'idle') void schedule.fetchSchedule();
  }, []);

  return null;
}

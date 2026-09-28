import { ScheduleResponseSchema, type ScheduleResponse } from '@nakanune/shared';
import { toast } from 'sonner';
import { create } from 'zustand';
import { ApiError, api, describeError } from '@/lib/api';
import { useTasksStore } from './tasks';

type ScheduleState = {
  schedule: ScheduleResponse | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  syncing: boolean;
  fetchSchedule: (options?: { recheck?: boolean }) => Promise<void>;
  syncSchedule: () => Promise<void>;
};

export const useScheduleStore = create<ScheduleState>()((set, get) => ({
  schedule: null,
  status: 'idle',
  syncing: false,

  async fetchSchedule({ recheck = true } = {}) {
    if (!get().schedule) set({ status: 'loading' });
    try {
      const schedule = await api.getSchedule();
      set({ schedule, status: 'ready' });
      // Сервер перепроверяет сайт в фоне — через пару секунд заберём результат (один раз)
      if (schedule.refreshing && recheck) {
        setTimeout(() => void get().fetchSchedule({ recheck: false }), 3000);
      }
    } catch {
      set({ status: 'error' });
    }
  },

  async syncSchedule() {
    set({ syncing: true });
    try {
      set({ schedule: await api.syncSchedule() });
      toast.success('Расписание обновлено');
      // Синхронизация могла завести новые предметы — перечитываем их
      await useTasksStore.getState().fetchInitialData();
    } catch (error) {
      toast.error('Не удалось обновить расписание', { description: describeError(error) });
      // При ошибке сайта (502) сервер всё равно присылает прежнее расписание и текст ошибки
      const previous =
        error instanceof ApiError ? ScheduleResponseSchema.safeParse(error.body) : null;
      if (previous?.success) set({ schedule: previous.data });
    } finally {
      set({ syncing: false });
    }
  },
}));

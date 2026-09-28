// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: js/store.js. Имена методов сохранены; вместо ручного pub/sub — Zustand,
// вместо своего Toast — sonner, подтверждение удаления вынесено из стора в компонент.
import {
  toMinskDateKey,
  type ExtractResult,
  type SubjectDto,
  type TaskCreateInput,
  type TaskDto,
  type TaskUpdateInput,
} from '@nakanune/shared';
import { toast } from 'sonner';
import { create } from 'zustand';
import { api, describeError } from '@/lib/api';
import { compareTasks } from '@/lib/grouping';

type TasksState = {
  subjects: SubjectDto[];
  tasks: TaskDto[];
  status: 'idle' | 'loading' | 'ready' | 'error';

  fetchInitialData: () => Promise<void>;
  addTasks: (tasks: TaskCreateInput[]) => Promise<boolean>;
  updateTask: (id: string, patch: TaskUpdateInput) => Promise<void>;
  toggleTaskStatus: (id: string) => Promise<void>;
  archiveTask: (id: string) => Promise<void>;
  restoreTask: (id: string) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  markPendingTasksForDateCompleted: (dateKey: string) => Promise<void>;

  // «Входящие»: вставка текста на разбор и проверка найденного (в StudyPlan — currentPaste)
  extractFromText: (text: string) => Promise<ExtractResult | null>;
  acceptTasks: (ids: string[]) => Promise<void>;
};

// Стор живёт на уровне модуля. На сервере Next такой модуль общий для всех запросов,
// поэтому данные в него попадают только в браузере — из useEffect в <DataLoader/>.
export const useTasksStore = create<TasksState>()((set, get) => {
  /**
   * Оптимистичное обновление, как в StudyPlan: интерфейс меняется сразу, запрос идёт следом.
   * Отличия: откат — по id (в StudyPlan по индексу, а список мог измениться за время
   * запроса), и он срабатывает и на ответ 4xx/5xx, а не только на обрыв сети.
   */
  async function optimistic(
    ids: string[],
    change: Partial<TaskDto>,
    save: () => Promise<TaskDto[]>,
    failure: string,
  ) {
    const affected = new Set(ids);
    const before = new Map(
      get()
        .tasks.filter((t) => affected.has(t.id))
        .map((t) => [t.id, t]),
    );
    set((state) => ({
      tasks: state.tasks.map((t) => (affected.has(t.id) ? { ...t, ...change } : t)),
    }));

    try {
      // Сервер вернул сохранённые задания — берём его версию (свежий updatedAt и т. п.)
      const saved = new Map((await save()).map((t) => [t.id, t]));
      set((state) => ({ tasks: state.tasks.map((t) => saved.get(t.id) ?? t).sort(compareTasks) }));
    } catch (error) {
      set((state) => ({ tasks: state.tasks.map((t) => before.get(t.id) ?? t).sort(compareTasks) }));
      toast.error(failure, { description: describeError(error) });
    }
  }

  return {
    subjects: [],
    tasks: [],
    status: 'idle',

    async fetchInitialData() {
      set({ status: 'loading' });
      try {
        const [subjects, tasks] = await Promise.all([api.getSubjects(), api.getTasks()]);
        set({ subjects, tasks, status: 'ready' });
      } catch (error) {
        set({ status: 'error' });
        toast.error('Не удалось загрузить задания', { description: describeError(error) });
      }
    },

    async addTasks(newTasks) {
      try {
        const report = await api.createTasks(newTasks);
        // Сервер вернул созданные задания — в StudyPlan после добавления перечитывался весь список
        set((state) => ({ tasks: [...state.tasks, ...report.inserted].sort(compareTasks) }));

        const added = report.inserted.length;
        if (added > 0)
          toast.success(added === 1 ? 'Задание добавлено' : `Добавлено заданий: ${added}`);
        if (report.duplicates.length > 0) {
          toast.warning('Такое задание уже есть', {
            description: report.duplicates.map((d) => d.title).join(', '),
          });
        }
        if (report.errors.length > 0) {
          toast.error('Не удалось добавить', { description: report.errors[0]?.message });
        }
        return added > 0;
      } catch (error) {
        toast.error('Не удалось добавить', { description: describeError(error) });
        return false;
      }
    },

    updateTask(id, patch) {
      return optimistic(
        [id],
        patch,
        async () => [await api.updateTask(id, patch)],
        'Не удалось сохранить изменения',
      );
    },

    async toggleTaskStatus(id) {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      const status = task.status === 'DONE' ? 'TODO' : 'DONE';
      await optimistic(
        [id],
        { status },
        async () => [await api.updateTask(id, { status })],
        'Не удалось отметить задание',
      );
    },

    archiveTask(id) {
      return optimistic(
        [id],
        { archived: true },
        async () => [await api.updateTask(id, { archived: true })],
        'Не удалось перенести в архив',
      );
    },

    restoreTask(id) {
      return optimistic(
        [id],
        { archived: false },
        async () => [await api.updateTask(id, { archived: false })],
        'Не удалось вернуть из архива',
      );
    },

    async deleteTask(id) {
      const task = get().tasks.find((t) => t.id === id);
      if (!task) return;
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) }));
      try {
        await api.deleteTask(id);
      } catch (error) {
        // Возвращаем задание, если его ещё нет в списке (в StudyPlan — splice по старому индексу)
        set((state) => ({
          tasks: state.tasks.some((t) => t.id === id)
            ? state.tasks
            : [...state.tasks, task].sort(compareTasks),
        }));
        toast.error('Не удалось удалить', { description: describeError(error) });
      }
    },

    /** «Отметить все за день»: одним запросом PATCH /api/tasks вместо N запросов, как было. */
    async markPendingTasksForDateCompleted(dateKey) {
      const ids = get()
        .tasks.filter(
          (t) =>
            t.status === 'TODO' && !t.archived && t.dueAt && toMinskDateKey(t.dueAt) === dateKey,
        )
        .map((t) => t.id);
      if (ids.length === 0) return;
      await optimistic(
        ids,
        { status: 'DONE' },
        () => api.updateTasks({ ids, patch: { status: 'DONE' } }),
        'Не удалось отметить задания',
      );
    },

    /** Разбор вставленного текста: найденное сервер кладёт во «Входящие» (статус INBOX). */
    async extractFromText(text) {
      try {
        const result = await api.extract(text);
        const { inserted, duplicates } = result.report;
        set((state) => ({ tasks: [...state.tasks, ...inserted].sort(compareTasks) }));

        if (inserted.length > 0) {
          toast.success(`Найдено заданий: ${inserted.length}`, { description: 'Проверь их ниже' });
        } else if (result.engine === null) {
          toast.info('Эти сообщения уже разбирались');
        } else if (duplicates.length > 0) {
          toast.info('Эти задания уже есть');
        } else {
          toast.info('Заданий в тексте не нашлось');
        }
        return result;
      } catch (error) {
        toast.error('Не удалось разобрать текст', { description: describeError(error) });
        return null;
      }
    },

    /** «Принять»: задание из «Входящих» становится обычным (TODO). */
    async acceptTasks(ids) {
      if (ids.length === 0) return;
      await optimistic(
        ids,
        { status: 'TODO' },
        () => api.updateTasks({ ids, patch: { status: 'TODO' } }),
        'Не удалось принять',
      );
    },
  };
});

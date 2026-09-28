import {
  extractTasksHeuristic,
  findSubjectByName,
  fromMinskDateTime,
  resolveDue,
  type ExtractedItem,
  type Priority,
  type ScheduleContext,
  type SubjectRef,
} from '@nakanune/shared';
import { ZodError } from 'zod';
import { extractWithGemini, type GeminiConfig, type MessageForAi } from './gemini';
import { buildSystemInstruction, listUpcomingClasses } from './prompt';

/** Черновик задания из сообщения — одинаковый у ИИ и у эвристики. */
export type Draft = {
  messageId: string;
  title: string;
  subjectId: string | null;
  dueAt: string | null;
  dueAtIsGuess: boolean;
  summary: string | null;
  confidenceScore: number;
  priority: Priority;
  labels: string[];
};

export type ExtractContext = {
  subjects: SubjectRef[];
  schedule: ScheduleContext | null;
  now: Date;
  /** Ручная вставка: ничего не нашлось — весь текст одним черновиком. Для чатов — нет. */
  wholeTextFallback?: boolean;
};

export type ExtractOutcome = {
  engine: 'gemini' | 'heuristic';
  notice: string | null;
  drafts: Draft[];
};

/**
 * Разбор сообщений: Gemini, а если ключа нет или ИИ ответил ошибкой — эвристика
 * (как в StudyPlan). notice объясняет, почему без ИИ.
 */
export async function extractDrafts(
  messages: MessageForAi[],
  context: ExtractContext,
  gemini: GeminiConfig | null,
): Promise<ExtractOutcome> {
  let notice = 'Ключ Gemini не задан — текст разобран без ИИ, проверь задания внимательнее';

  if (gemini) {
    try {
      const earliest = new Date(Math.min(...messages.map((message) => message.sentAt.getTime())));
      const systemInstruction = buildSystemInstruction({
        now: context.now,
        subjects: context.subjects,
        upcomingClasses: listUpcomingClasses(context.schedule, context.subjects, earliest),
      });
      const items = await extractWithGemini(messages, systemInstruction, gemini);
      return {
        engine: 'gemini',
        notice: null,
        drafts: fromAiItems(items, messages, context.subjects),
      };
    } catch (error) {
      notice = `ИИ не справился (${describeFailure(error)}) — текст разобран без ИИ, проверь задания внимательнее`;
    }
  }
  return { engine: 'heuristic', notice, drafts: fromHeuristic(messages, context) };
}

function describeFailure(error: unknown): string {
  if (error instanceof ZodError) return 'ответ не прошёл проверку схемы';
  if (error instanceof SyntaxError) return 'ответ — не JSON';
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 150 ? `${message.slice(0, 150)}…` : message;
}

function fromAiItems(
  items: ExtractedItem[],
  messages: MessageForAi[],
  subjects: SubjectRef[],
): Draft[] {
  const messageIds = new Set(messages.map((message) => message.id));
  return items.flatMap((item) => {
    if (!item.isHomework || !item.title || !messageIds.has(item.messageId)) return [];
    const dueAt = parseAiDate(item.dueAt);
    return {
      messageId: item.messageId,
      title: item.title,
      // В StudyPlan пустое имя предмета совпадало с первым же предметом, а «не нашёлся» —
      // превращался в subjects[3] (баг №6). Здесь не нашёлся — значит «Без предмета»
      subjectId: item.subjectName ? findSubjectByName(item.subjectName, subjects) : null,
      dueAt: dueAt?.toISOString() ?? null,
      // Срок, который не удалось прочитать, помечаем как догадку
      dueAtIsGuess: item.dueAtIsGuess || (item.dueAt !== null && dueAt === null),
      summary: item.summary?.trim() || null,
      confidenceScore: item.confidence,
      priority: item.priority,
      labels: [
        ...new Set(item.labels.map((label) => label.replace(/^#/, '').trim()).filter(Boolean)),
      ],
    };
  });
}

/** Дата от модели: ISO с зоной — как есть; без зоны или только день — по Минску. */
export function parseAiDate(value: string | null): Date | null {
  if (!value) return null;
  const text = value.trim();
  const dayOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(text);
  if (dayOnly) return fromMinskDateTime(dayOnly[1]!, '23:59');
  const local = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(text);
  if (local) return fromMinskDateTime(local[1]!, local[2]!);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fromHeuristic(messages: MessageForAi[], context: ExtractContext): Draft[] {
  return messages.flatMap((message) =>
    extractTasksHeuristic(message.text, {
      sentAt: message.sentAt,
      subjects: context.subjects,
      wholeTextFallback: context.wholeTextFallback,
    }).map((task) => {
      const due = resolveDue(task.due, task.subjectId, message.sentAt, context.schedule);
      return {
        messageId: message.id,
        title: task.title,
        subjectId: task.subjectId,
        dueAt: due.dueAt?.toISOString() ?? null,
        dueAtIsGuess: due.isGuess,
        summary: null,
        confidenceScore: task.confidence,
        priority: task.priority,
        labels: task.labels,
      };
    }),
  );
}

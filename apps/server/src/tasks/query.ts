import type { Prisma } from '@nakanune/db';

/** Связи, которые нужны для ответа API: откуда задание (источник и исходное сообщение). */
export const taskInclude = {
  source: { select: { type: true, title: true } },
  rawMessage: { select: { text: true, sentAt: true } },
} satisfies Prisma.TaskInclude;

export type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

import { z } from 'zod';

/** Предмет в ответах API. */
export const SubjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortCode: z.string().nullable(),
  color: z.string(),
  aliases: z.array(z.string()),
});

export type SubjectDto = z.infer<typeof SubjectSchema>;

// В StudyPlan цвет был одной из CSS-переменных темы, у нас — любой hex.
const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, 'Цвет в формате #rrggbb');

const subjectFields = {
  name: z.string().trim().min(1, 'Название обязательно').max(100),
  shortCode: z.string().trim().min(1).max(12).nullable(),
  color: hexColor,
  aliases: z.array(z.string().trim().min(1).max(60)).max(30),
};

/** Тело POST /api/subjects. Не указан shortCode — сервер соберёт его из названия. */
export const SubjectCreateSchema = z.object(subjectFields).partial().required({ name: true });

/** Тело PUT /api/subjects/:id — любые поля, но хотя бы одно. */
export const SubjectUpdateSchema = z
  .object(subjectFields)
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, 'Нет полей для обновления');

export type SubjectCreateInput = z.infer<typeof SubjectCreateSchema>;
export type SubjectUpdateInput = z.infer<typeof SubjectUpdateSchema>;

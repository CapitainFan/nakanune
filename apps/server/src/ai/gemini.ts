// Развитие /api/extract из StudyPlan (server.js). Там ответ модели чистился регэкспом от
// ```json и шёл в JSON.parse без всякой проверки (баг №3). Здесь — structured output:
// модели передаётся JSON Schema ответа, а результат проверяется той же zod-схемой.
import { GoogleGenAI, type ContentListUnion } from '@google/genai';
import {
  ExtractResponseSchema,
  ImageExtractResponseSchema,
  inMinsk,
  type ExtractedItem,
} from '@nakanune/shared';
import { format } from 'date-fns';
import { z } from 'zod';

/** Ключ и модели по порядку: не ответила первая — пробуем следующую. */
export type GeminiConfig = { apiKey: string; models: string[] };

export type MessageForAi = { id: string; sentAt: Date; source: string; text: string };

/** Фото доски: байты и тип; id и время — как у сообщения. */
export type ImageForAi = { id: string; sentAt: Date; data: Buffer; mimeType: string };

/** JSON Schema для Gemini. io: 'input' — то, что присылает модель (до наших transform). */
function responseSchemaOf(schema: z.ZodType) {
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema, { io: 'input' });
  return jsonSchema;
}
const textResponseSchema = responseSchemaOf(ExtractResponseSchema);
const imageResponseSchema = responseSchemaOf(ImageExtractResponseSchema);

const minskIso = (date: Date) => format(date, "yyyy-MM-dd'T'HH:mm:ssXXX", { in: inMinsk });

async function generate(
  contents: ContentListUnion,
  responseJsonSchema: object,
  systemInstruction: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<unknown> {
  // Повторы SDK (до 5 попыток с паузами до минуты) выключены: при 503 быстрее
  // перейти к другой модели, чем ждать эту
  const ai = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: 0,
      abortSignal: AbortSignal.timeout(timeoutMs),
    },
  });
  if (!response.text) throw new Error('модель вернула пустой ответ');
  return JSON.parse(response.text);
}

export async function extractWithGemini(
  messages: MessageForAi[],
  systemInstruction: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<ExtractedItem[]> {
  // Сообщения — отдельно от инструкций и в виде данных (JSON), а не частью текста промпта.
  // Имена авторов не отправляем: для разбора они не нужны
  const contents = JSON.stringify(
    messages.map((message) => ({
      id: message.id,
      sentAt: minskIso(message.sentAt),
      source: message.source,
      text: message.text,
    })),
  );
  const answer = await generate(
    contents,
    textResponseSchema,
    systemInstruction,
    apiKey,
    model,
    timeoutMs,
  );
  return ExtractResponseSchema.parse(answer).items;
}

/** Фото доски: картинка и JSON с id и временем — тем же способом, что и текст. */
export async function extractImageWithGemini(
  image: ImageForAi,
  systemInstruction: string,
  apiKey: string,
  model: string,
  timeoutMs: number,
): Promise<{ items: ExtractedItem[]; transcript: string }> {
  const contents: ContentListUnion = [
    { inlineData: { mimeType: image.mimeType, data: image.data.toString('base64') } },
    {
      text: JSON.stringify({ id: image.id, sentAt: minskIso(image.sentAt), source: 'фото доски' }),
    },
  ];
  const answer = await generate(
    contents,
    imageResponseSchema,
    systemInstruction,
    apiKey,
    model,
    timeoutMs,
  );
  return ImageExtractResponseSchema.parse(answer);
}

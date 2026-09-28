// Развитие /api/extract из StudyPlan (server.js). Там ответ модели чистился регэкспом от
// ```json и шёл в JSON.parse без всякой проверки (баг №3). Здесь — structured output:
// модели передаётся JSON Schema ответа, а результат проверяется той же zod-схемой.
import { GoogleGenAI } from '@google/genai';
import { ExtractResponseSchema, inMinsk, type ExtractedItem } from '@nakanune/shared';
import { format } from 'date-fns';
import { z } from 'zod';

export type GeminiConfig = { apiKey: string; model: string };

export type MessageForAi = { id: string; sentAt: Date; source: string; text: string };

// io: 'input' — схема того, что присылает модель (до наших transform: обрезки, округления).
// $schema Gemini не нужен.
const { $schema, ...responseJsonSchema } = z.toJSONSchema(ExtractResponseSchema, {
  io: 'input',
});

export async function extractWithGemini(
  messages: MessageForAi[],
  systemInstruction: string,
  config: GeminiConfig,
): Promise<ExtractedItem[]> {
  const ai = new GoogleGenAI({ apiKey: config.apiKey });

  const response = await ai.models.generateContent({
    model: config.model,
    // Сообщения — отдельно от инструкций и в виде данных (JSON), а не частью текста промпта
    contents: JSON.stringify(
      messages.map((message) => ({
        id: message.id,
        sentAt: format(message.sentAt, "yyyy-MM-dd'T'HH:mm:ssXXX", { in: inMinsk }),
        source: message.source,
        text: message.text,
      })),
    ),
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseJsonSchema,
      temperature: 0,
      abortSignal: AbortSignal.timeout(30_000),
    },
  });

  if (!response.text) throw new Error('модель вернула пустой ответ');
  return ExtractResponseSchema.parse(JSON.parse(response.text)).items;
}

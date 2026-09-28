import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractDrafts, parseAiDate } from './extract';

// Настоящий Gemini в тестах не вызываем: подменяем SDK и проверяем, что ему передали
const generateContent = vi.hoisted(() => vi.fn());
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

const subjects = [
  { id: 'ma', name: 'Математический анализ', shortCode: 'МА', aliases: ['матан'] },
  { id: 'alg', name: 'Алгебра и теория чисел', shortCode: 'АиТЧ', aliases: ['алгебра'] },
];
// Понедельник, 28 сентября 2026, 12:00 по Минску
const now = new Date('2026-09-28T09:00:00Z');
const context = { subjects, schedule: null, now };
const gemini = { apiKey: 'test-key', model: 'gemini-test' };
const message = { id: 'm1', sentAt: now, source: 'чат группы', text: 'Матан: к пятнице №1234 #кр' };

const aiItem = (fields: Record<string, unknown> = {}) => ({
  messageId: 'm1',
  isHomework: true,
  subjectName: 'Математический анализ',
  title: 'Решить №1234',
  summary: 'Решить задачу из Демидовича, сдать в тетради.',
  dueAt: '2026-10-02T08:15:00+03:00',
  dueAtIsGuess: false,
  confidence: 92,
  priority: 'high',
  labels: ['кр'],
  ...fields,
});

beforeEach(() => {
  generateContent.mockReset();
});

describe('extractDrafts через Gemini', () => {
  it('отдаёт сообщения данными, а правила — отдельной инструкцией', async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ items: [aiItem()] }) });

    const outcome = await extractDrafts([message], context, gemini);

    const request = generateContent.mock.calls[0]![0];
    expect(request.model).toBe('gemini-test');
    // Текст сообщения — только в contents и только как JSON, в инструкции его нет
    expect(JSON.parse(request.contents)).toEqual([
      { id: 'm1', sentAt: '2026-09-28T12:00:00+03:00', source: 'чат группы', text: message.text },
    ]);
    expect(request.config.systemInstruction).not.toContain(message.text);
    // Structured output: JSON Schema ответа и JSON на выходе
    expect(request.config.responseMimeType).toBe('application/json');
    expect(request.config.responseJsonSchema).toMatchObject({ type: 'object' });

    expect(outcome).toEqual({
      engine: 'gemini',
      notice: null,
      drafts: [
        {
          messageId: 'm1',
          title: 'Решить №1234',
          subjectId: 'ma',
          dueAt: '2026-10-02T05:15:00.000Z',
          dueAtIsGuess: false,
          summary: 'Решить задачу из Демидовича, сдать в тетради.',
          confidenceScore: 92,
          priority: 'high',
          labels: ['кр'],
        },
      ],
    });
  });

  it('мелкие огрехи модели чинит, а не выбрасывает ответ', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({
        items: [
          aiItem({ title: 'а'.repeat(150), confidence: 87.6, labels: ['#кр', 'кр'] }),
          aiItem({ isHomework: false, title: '' }),
          aiItem({ messageId: 'чужой' }), // такого сообщения не было
        ],
      }),
    });

    const { drafts } = await extractDrafts([message], context, gemini);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ confidenceScore: 88, labels: ['кр'] });
    expect(drafts[0]!.title).toHaveLength(120);
  });

  it('неизвестный предмет — «Без предмета», а не первый попавшийся (баг №6)', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ items: [aiItem({ subjectName: 'Физика' })] }),
    });
    const { drafts } = await extractDrafts([message], context, gemini);
    expect(drafts[0]!.subjectId).toBeNull();
  });

  it('если Gemini упал или ответ не по схеме — разбирает эвристикой и объясняет почему', async () => {
    generateContent.mockRejectedValue(new Error('429 Too Many Requests'));
    const failed = await extractDrafts([message], context, gemini);
    expect(failed.engine).toBe('heuristic');
    expect(failed.notice).toContain('429 Too Many Requests');
    expect(failed.drafts[0]).toMatchObject({ subjectId: 'ma', labels: ['кр'] });

    generateContent.mockResolvedValue({ text: '{"items": [{"title": 1}]}' });
    const invalid = await extractDrafts([message], context, gemini);
    expect(invalid.engine).toBe('heuristic');
    expect(invalid.notice).toContain('не прошёл проверку схемы');
  });

  it('без ключа сразу эвристика', async () => {
    const outcome = await extractDrafts([message], context, null);
    expect(outcome.engine).toBe('heuristic');
    expect(outcome.notice).toContain('Ключ Gemini не задан');
    expect(generateContent).not.toHaveBeenCalled();
  });
});

describe('parseAiDate', () => {
  it('понимает даты с зоной, без зоны (минское время) и только день', () => {
    expect(parseAiDate('2026-10-02T08:15:00+03:00')?.toISOString()).toBe(
      '2026-10-02T05:15:00.000Z',
    );
    expect(parseAiDate('2026-10-02T08:15:00')?.toISOString()).toBe('2026-10-02T05:15:00.000Z');
    expect(parseAiDate('2026-10-02')?.toISOString()).toBe('2026-10-02T20:59:00.000Z');
    expect(parseAiDate('в пятницу')).toBeNull();
    expect(parseAiDate(null)).toBeNull();
  });
});

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
const gemini = { apiKey: 'test-key', models: ['gemini-test'] };
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
      model: 'gemini-test',
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

  it('задание по лекционному предмету с отдельной практикой — на практику', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ items: [aiItem({ subjectName: 'Алгебра и теория чисел' })] }),
    });
    const { drafts } = await extractDrafts(
      [message],
      { ...context, practiceOf: { alg: 'ma' } },
      gemini,
    );
    expect(drafts[0]!.subjectId).toBe('ma');
  });

  it('неизвестный предмет — «Без предмета», а не первый попавшийся (баг №6)', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ items: [aiItem({ subjectName: 'Физика' })] }),
    });
    const { drafts } = await extractDrafts([message], context, gemini);
    expect(drafts[0]!.subjectId).toBeNull();
  });

  it('перегруженная модель — пробует следующую', async () => {
    generateContent
      .mockRejectedValueOnce(new Error('{"error":{"code":503,"message":"high demand"}}'))
      .mockResolvedValueOnce({ text: JSON.stringify({ items: [aiItem()] }) });

    const outcome = await extractDrafts([message], context, {
      apiKey: 'test-key',
      models: ['gemini-new', 'gemini-old'],
    });
    expect(generateContent.mock.calls.map(([request]) => request.model)).toEqual([
      'gemini-new',
      'gemini-old',
    ]);
    expect(outcome).toMatchObject({ engine: 'gemini', model: 'gemini-old', notice: null });
  });

  it('срок не назван — к следующей практике по предмету, как догадка', async () => {
    generateContent.mockResolvedValue({
      text: JSON.stringify({ items: [aiItem({ dueAt: null })] }),
    });
    const schedule = {
      firstWeekDate: '2026-09-01',
      classes: [
        // Лекция в понедельник 13:00 — не она, а практика в среду 11:15
        {
          subjectId: 'ma',
          weekday: 1,
          weekParity: null,
          validFrom: null,
          startTime: '13:00',
          kind: 'LECTURE' as const,
        },
        {
          subjectId: 'ma',
          weekday: 3,
          weekParity: null,
          validFrom: null,
          startTime: '11:15',
          kind: 'LAB' as const,
        },
      ],
    };
    const { drafts } = await extractDrafts([message], { ...context, schedule }, gemini);
    expect(drafts[0]).toMatchObject({ dueAt: '2026-09-30T08:15:00.000Z', dueAtIsGuess: true });

    // Модель назвала только день (23:59) — сдвигаем на начало практики в этот день
    generateContent.mockResolvedValue({
      text: JSON.stringify({ items: [aiItem({ dueAt: '2026-09-30T23:59:00+03:00' })] }),
    });
    const { drafts: dayOnly } = await extractDrafts([message], { ...context, schedule }, gemini);
    expect(dayOnly[0]).toMatchObject({ dueAt: '2026-09-30T08:15:00.000Z', dueAtIsGuess: false });
  });

  it('если все модели упали или ответ не по схеме — разбирает эвристикой и объясняет почему', async () => {
    generateContent.mockRejectedValue(new Error('{"error":{"code":429,"message":"quota"}}'));
    const failed = await extractDrafts([message], context, gemini);
    expect(failed.engine).toBe('heuristic');
    expect(failed.notice).toContain('gemini-test: исчерпан лимит (429)');
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULE_URL, mockScheduleSite, scheduleFixture } from '../../test/schedule-site';
import { fetchScheduleHtml, parseScheduleTable } from './mmfSchedule';

describe('parseScheduleTable', () => {
  const rows = parseScheduleTable(scheduleFixture);
  const find = (weekday: number, startTime: string, subgroup: string | null = null) =>
    rows.find((r) => r.weekday === weekday && r.startTime === startTime && r.subgroup === subgroup);

  it('разбирает все 35 строк, строку заголовка пропускает', () => {
    expect(rows).toHaveLength(35);
  });

  it('переносы строк внутри ячеек не ломают разбор', () => {
    // Так таблицу однажды переформатировал Prettier: браузер покажет то же самое,
    // значит и разбор должен совпасть
    const reformatted = scheduleFixture
      .replaceAll('<br />', '<br />\n      ')
      .replace('(с 08.09)', '(с\n      08.09)');
    expect(parseScheduleTable(reformatted)).toEqual(rows);
  });

  it('у физкультуры берёт время из ячейки предмета', () => {
    expect(rows[0]).toMatchObject({
      weekday: 1,
      subject: 'Физическая культура',
      startTime: '09:30',
      endTime: '10:50',
      kind: null,
      teacher: null,
      room: null,
    });
  });

  it('подгруппа, тип занятия, преподаватель, аудитория', () => {
    expect(find(1, '11:15', 'б')).toMatchObject({
      subject: 'Учебно-исследовательская работа',
      kind: 'PRACTICE',
      teacher: 'асс. Белый М.А.',
      room: '146',
    });
  });

  it('неделя и подгруппа вместе: «1н/а», «2н/б»', () => {
    const friday = rows.filter((r) => r.weekday === 5 && r.startTime === '11:15');
    expect(friday).toMatchObject([
      { subject: 'Веб-дизайн', weekParity: 1, subgroup: 'а', kind: 'LAB' },
      { subject: 'Веб-дизайн', weekParity: 2, subgroup: 'б', kind: 'LAB' },
    ]);
  });

  it('поток нескольких групп «2/6в(н)» — это подгруппа «в»', () => {
    expect(find(1, '16:00', 'в')).toMatchObject({
      subject: 'Английский язык',
      teacher: 'ст.преп.Листратенко Н.В.',
      note: 'поток 2/6в(н)',
    });
  });

  it('адрес корпуса уходит в заметку, «(с 08.09)» и «с 10.10» — в validFrom', () => {
    expect(find(2, '08:15')).toMatchObject({
      subject: 'История белорусской гусударственности',
      teacher: 'ст.преп. Кимбар А.В.',
      note: 'ул. Ленинградская, 14',
      validFrom: { day: 8, month: 9 },
      room: '701 Химфак',
      kind: 'LECTURE',
    });
    expect(find(6, '09:45')).toMatchObject({
      subject: 'Психология управления',
      validFrom: { day: 10, month: 10 },
    });
  });

  it('преподаватель без должности или без инициалов', () => {
    expect(find(6, '11:15')).toMatchObject({
      subject: 'кураторский/информационный час',
      teacher: 'Гриц А.Ю.',
      kind: null,
      room: '351',
    });
    expect(find(6, '13:00')).toMatchObject({
      weekParity: 2,
      teacher: 'преп. Кимбар',
      kind: 'SEMINAR',
    });
  });

  it('страница без таблицы — пустой список', () => {
    expect(parseScheduleTable('<p>Расписание скоро появится</p>')).toEqual([]);
  });
});

describe('fetchScheduleHtml', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ищет страницу через REST API WordPress по slug и сверяет адрес', async () => {
    const fetchMock = mockScheduleSite('<table>моя группа</table>');

    await expect(fetchScheduleHtml(SCHEDULE_URL)).resolves.toBe('<table>моя группа</table>');

    const requested = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requested.pathname).toBe('/wp-json/wp/v2/pages');
    expect(requested.searchParams.get('slug')).toBe('2-gruppa');
  });

  it('понятные ошибки: страницы нет, сайт не отвечает', async () => {
    mockScheduleSite();
    await expect(
      fetchScheduleHtml(
        'https://mmf.bsu.by/ru/raspisanie-zanyatij/dnevnoe-otdelenie/3-kurs/2-gruppa/',
      ),
    ).rejects.toThrow('Страница группы не найдена');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('oops', { status: 503 }));
    await expect(fetchScheduleHtml(SCHEDULE_URL)).rejects.toThrow('ответил 503');
  });
});

import type { ClassKind } from '@nakanune/shared';
import { parse } from 'node-html-parser';
import { z } from 'zod';

/** Строка таблицы расписания — ещё без привязки к предметам в базе. */
export type ScheduleRow = {
  weekday: number; // 1 — понедельник
  startTime: string; // "09:45"
  endTime: string;
  subject: string;
  kind: ClassKind | null;
  teacher: string | null;
  room: string | null;
  subgroup: string | null; // «а», «б»… null — вся группа
  weekParity: 1 | 2 | null; // «1н»/«2н»
  validFrom: { day: number; month: number } | null; // «с 10.10»
  note: string | null;
};

const WEEKDAYS: Record<string, number> = {
  понедельник: 1,
  вторник: 2,
  среда: 3,
  четверг: 4,
  пятница: 5,
  суббота: 6,
  воскресенье: 7,
};

const KINDS: Record<string, ClassKind> = {
  'лекц.': 'LECTURE',
  'практ.': 'PRACTICE',
  'лаб.': 'LAB',
  'сем.': 'SEMINAR',
};

const TIME_RANGE = /^(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})$/;
// «(с 08.09)», «с 10.10»
const VALID_FROM = /^\(?с\s+(\d{1,2})\.(\d{1,2})\)?$/i;
// «доц. Кушель О.Ю.», «ст.преп.Листратенко Н.В.», «преп. Кимбар», «Гриц А.Ю.»
const TEACHER = /^(доц|проф|асс|ст\.\s*преп|преп)\.|[А-ЯЁ]\.\s?[А-ЯЁ]\.$/;
// Поток из нескольких групп перед названием: «2/6в(н) Английский язык» — подгруппа «в»
const STREAM_PREFIX = /^(\d+(?:\/\d+)*)([а-яё])(\([^)]*\))?\s+(.+)$/;

/** Текст как его показал бы браузер: переводы строк и повторные пробелы — один пробел. */
function visibleText(html: string): string {
  return parse(html).text.replace(/\s+/g, ' ').trim();
}

/** Разбирает таблицу со страницы группы на mmf.bsu.by (ячейки размечены классами td.weekday, td.time…). */
export function parseScheduleTable(html: string): ScheduleRow[] {
  return parse(html)
    .querySelectorAll('tr')
    .flatMap((tr) => {
      const td = (name: string) => tr.querySelector(`td.${name}`);
      const cell = (name: string) => visibleText(td(name)?.innerHTML ?? '');

      const weekday = WEEKDAYS[cell('weekday').toLowerCase()];
      const slot = TIME_RANGE.exec(cell('time'));
      // Строки внутри ячейки разделяет только <br />: перевод строки в самом HTML
      // ничего не значит (браузер покажет его как пробел)
      const [firstLine, ...extraLines] = (td('subject-teachers')?.innerHTML ?? '')
        .split(/<br\s*\/?>/i)
        .map(visibleText)
        .filter(Boolean);
      // Строка заголовка (<th>) или что-то неожиданное — пропускаем
      if (!weekday || !slot || !firstLine) return [];

      const row: ScheduleRow = {
        weekday,
        startTime: padTime(slot[1]!),
        endTime: padTime(slot[2]!),
        subject: firstLine,
        kind: KINDS[cell('lecture-practice')] ?? null,
        teacher: null,
        room: cell('room') || null,
        subgroup: null,
        weekParity: null,
        validFrom: null,
        note: null,
      };

      // «Группа»: «а», «2н», «1н/а»
      const remarks = cell('remarks').split('/');
      for (const token of remarks.map((part) => part.trim())) {
        if (token === '1н' || token === '2н') row.weekParity = token === '1н' ? 1 : 2;
        else if (/^[а-яё]$/.test(token)) row.subgroup = token;
      }

      const notes: string[] = [];
      const stream = STREAM_PREFIX.exec(firstLine);
      if (stream) {
        row.subject = stream[4]!;
        row.subgroup ??= stream[2]!;
        notes.push(`поток ${stream[1]}${stream[2]}${stream[3] ?? ''}`);
      }

      for (const line of extraLines) {
        const time = TIME_RANGE.exec(line);
        const from = VALID_FROM.exec(line);
        if (time) {
          // У физкультуры своё время прямо в ячейке: «9:30-10:50»
          row.startTime = padTime(time[1]!);
          row.endTime = padTime(time[2]!);
        } else if (from) {
          row.validFrom = { day: Number(from[1]), month: Number(from[2]) };
        } else if (!row.teacher && TEACHER.test(line)) {
          row.teacher = line;
        } else {
          notes.push(line); // адрес корпуса и прочее
        }
      }
      row.note = notes.length > 0 ? notes.join('; ') : null;

      return [row];
    });
}

/** "9:45" → "09:45", чтобы время сортировалось как строка. */
function padTime(time: string): string {
  return time.padStart(5, '0');
}

const WpPagesSchema = z.array(
  z.object({
    link: z.string(),
    content: z.object({ rendered: z.string() }),
  }),
);

/**
 * HTML таблицы расписания по ссылке на страницу группы. Сама страница отвечает очень
 * долго, и таблицы в её HTML нет, поэтому берём содержимое через REST API WordPress:
 * ищем страницы по slug («2-gruppa» есть у каждого курса) и выбираем ту, чей адрес совпал.
 */
export async function fetchScheduleHtml(pageUrl: string): Promise<string> {
  const url = new URL(pageUrl);
  const slug = url.pathname.split('/').filter(Boolean).at(-1);
  if (!slug) throw new Error('В ссылке нет адреса страницы группы');

  const api = new URL('/wp-json/wp/v2/pages', url.origin);
  api.searchParams.set('slug', slug);
  api.searchParams.set('_fields', 'link,content');
  api.searchParams.set('per_page', '100');

  const res = await fetch(api, {
    headers: { 'User-Agent': 'Nakanune (schedule sync)' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Сайт расписания ответил ${res.status}`);

  // Ответ чужого сайта тоже проверяем схемой, а не верим ему на слово
  const pages = WpPagesSchema.parse(await res.json());
  const page = pages.find((p) => samePage(p.link, pageUrl));
  if (!page) throw new Error('Страница группы не найдена на сайте');
  return page.content.rendered;
}

function samePage(a: string, b: string): boolean {
  const key = (value: string) => {
    const url = new URL(value);
    return url.host + url.pathname.replace(/\/+$/, '');
  };
  return key(a) === key(b);
}

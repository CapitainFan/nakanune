import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDb, setupSchedule } from '../../test/helpers';
import { mockScheduleSite, scheduleFixture } from '../../test/schedule-site';
import { prisma } from '../db';
import { syncSchedule } from './scheduleSync';

beforeEach(resetDb);
afterEach(() => {
  vi.restoreAllMocks();
});

// Из 35 строк таблицы моих — 23: английский в подгруппе «а», остальное — «б» или вся группа
const MY_CLASSES = 23;

describe('syncSchedule', () => {
  it('сохраняет пары моих подгрупп и создаёт недостающие предметы', async () => {
    const source = await setupSchedule();
    mockScheduleSite();

    expect(await syncSchedule(source.id)).toEqual({ status: 'updated', classes: MY_CLASSES });

    const classes = await prisma.classSession.findMany({ include: { subject: true } });
    for (const lesson of classes) {
      expect([null, lesson.subject.subgroup ?? 'б']).toContain(lesson.subgroup);
    }
    // Поток «2/6в(н)» — не мой, остаётся только английский в подгруппе «а»
    expect(classes.filter((c) => c.subject.name === 'Английский язык')).toHaveLength(1);

    // Опечатку из расписания нашёл алиас — второго предмета не появилось
    expect(await prisma.subject.count({ where: { name: { contains: 'гусударственности' } } })).toBe(
      0,
    );
    // Кураторского часа в сиде не было — предмет создан
    const curator = await prisma.subject.findUnique({
      where: { name: 'Кураторский/информационный час' },
    });
    expect(curator?.shortCode).toBe('КИЧ');

    // «с 10.10» → дата этого учебного года
    const psychology = classes.find((c) => c.subject.name === 'Психология управления');
    expect(psychology?.validFrom?.toISOString().slice(0, 10)).toBe('2026-10-10');

    const saved = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(saved.lastCursor).toMatch(/^[0-9a-f]{40}$/);
    expect(saved.lastError).toBeNull();
  });

  it('не трогает пары, если страница не изменилась', async () => {
    const source = await setupSchedule();
    mockScheduleSite();
    await syncSchedule(source.id);
    const before = await prisma.classSession.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    expect(await syncSchedule(source.id)).toEqual({ status: 'unchanged' });
    const after = await prisma.classSession.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(after).toEqual(before);
  });

  it('при изменении страницы заменяет пары целиком', async () => {
    const source = await setupSchedule();
    mockScheduleSite();
    await syncSchedule(source.id);

    const withoutCuratorHour = scheduleFixture
      .split('</tr>')
      .filter((row) => !row.includes('кураторский'))
      .join('</tr>');
    mockScheduleSite(withoutCuratorHour);

    expect(await syncSchedule(source.id)).toEqual({ status: 'updated', classes: MY_CLASSES - 1 });
    expect(await prisma.classSession.count()).toBe(MY_CLASSES - 1);
  });

  it('ошибка сайта не стирает расписание, а попадает в lastError', async () => {
    const source = await setupSchedule();
    mockScheduleSite();
    await syncSchedule(source.id);

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('сеть недоступна'));
    expect(await syncSchedule(source.id)).toEqual({ status: 'failed', error: 'сеть недоступна' });

    expect(await prisma.classSession.count()).toBe(MY_CLASSES);
    const saved = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(saved.lastError).toBe('сеть недоступна');
  });

  it('если сайт поменял вёрстку и пар не нашлось — старое расписание остаётся', async () => {
    const source = await setupSchedule();
    mockScheduleSite();
    await syncSchedule(source.id);

    mockScheduleSite('<p>Расписание обновляется</p>');
    const result = await syncSchedule(source.id);

    expect(result.status).toBe('failed');
    expect(await prisma.classSession.count()).toBe(MY_CLASSES);
  });

  it('два одновременных вызова делят одну загрузку', async () => {
    const source = await setupSchedule();
    const fetchMock = mockScheduleSite();

    const [first, second] = await Promise.all([syncSchedule(source.id), syncSchedule(source.id)]);

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

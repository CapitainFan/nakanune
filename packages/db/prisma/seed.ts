import { createPrismaClient } from '../src/index';

// Предметы 1 курса, 2 группы ММФ — из расписания
// https://mmf.bsu.by/ru/raspisanie-zanyatij/dnevnoe-otdelenie/1-kurs/2-gruppa/
// aliases — как предмет называют в чатах и как он записан в расписании, если
// там иначе (опечатки тоже). По ним ИИ и синхронизация расписания находят предмет.
// Сленг — догадки: дополни тем, как пишут у вас в группе.
const subjects = [
  {
    name: 'Математический анализ',
    shortCode: 'МА',
    color: '#3b82f6',
    aliases: ['матан', 'мат. анализ', 'мат анализ', 'матанализ', 'МА'],
  },
  {
    name: 'Алгебра и теория чисел',
    shortCode: 'АиТЧ',
    color: '#8b5cf6',
    aliases: ['алгебра', 'АиТЧ', 'АТЧ'],
  },
  {
    name: 'Геометрия',
    shortCode: 'Геом',
    color: '#06b6d4',
    aliases: ['геома', 'аналит', 'аналитическая геометрия'],
  },
  {
    name: 'Методы программирования',
    shortCode: 'МП',
    color: '#f59e0b',
    aliases: ['методы прог', 'прога', 'МП'],
  },
  {
    name: 'Практикум по программированию',
    shortCode: 'Практикум',
    color: '#f97316',
    aliases: ['практикум', 'практикум по проге'],
  },
  {
    name: 'Веб-дизайн',
    shortCode: 'Веб',
    color: '#ec4899',
    aliases: ['веб', 'вебдизайн', 'веб дизайн'],
  },
  {
    name: 'Введение в специальность',
    shortCode: 'ВвС',
    color: '#14b8a6',
    aliases: ['введение в спец', 'ВвС'],
  },
  {
    name: 'Английский язык',
    shortCode: 'Англ',
    color: '#22c55e',
    aliases: ['английский', 'англ', 'инглиш'],
  },
  {
    name: 'Английский язык (профессиональная лексика)',
    shortCode: 'Англ-проф',
    color: '#84cc16',
    aliases: ['проф. английский', 'проф лексика', 'профессиональная лексика'],
  },
  {
    name: 'История белорусской государственности',
    shortCode: 'ИБГ',
    color: '#ef4444',
    // в расписании записано с опечаткой
    aliases: ['история', 'ИБГ', 'История белорусской гусударственности'],
  },
  {
    name: 'Психология управления',
    shortCode: 'Психология',
    color: '#a855f7',
    aliases: ['психология', 'психология управления'],
  },
  {
    name: 'Учебно-исследовательская работа',
    shortCode: 'УИР',
    color: '#6366f1',
    aliases: ['УИР'],
  },
  {
    name: 'Физическая культура',
    shortCode: 'Физра',
    color: '#64748b',
    aliases: ['физра', 'физкультура'],
  },
];

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL не задан — скопируй .env.example в .env');
}

const prisma = createPrismaClient(databaseUrl);

try {
  // upsert по уникальному name: сид можно запускать сколько угодно раз
  for (const subject of subjects) {
    await prisma.subject.upsert({
      where: { name: subject.name },
      update: subject,
      create: subject,
    });
  }
  console.log(`Предметов в базе: ${await prisma.subject.count()}`);
} finally {
  await prisma.$disconnect();
}

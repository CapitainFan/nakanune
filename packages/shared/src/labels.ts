// Adapted from StudyPlan (https://github.com/Charushi06/StudyPlan), MIT License
// Источник: js/app.js — extractLabels, getLabelColor.

// В StudyPlan было /#([\w-]+)/g: \w — только латиница, и «#контрольная» не находилась
const LABEL = /#([\p{L}\p{N}_-]+)/gu;

/** «Решить №5 #срочно #кр» → заголовок «Решить №5» и метки ['срочно', 'кр']. */
export function extractLabels(text: string): { cleanTitle: string; labels: string[] } {
  const labels = [...text.matchAll(LABEL)].map((match) => match[1]!);
  // После удаления тега оставался двойной пробел — схлопываем
  const cleanTitle = text.replace(LABEL, '').replace(/\s+/g, ' ').trim();
  return { cleanTitle, labels: [...new Set(labels)] };
}

const LABEL_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

/** Цвет метки по хэшу названия: одна и та же метка всегда одного цвета. */
export function labelColor(label: string): string {
  let hash = 0;
  for (const char of label) {
    hash = ((hash << 5) - hash + (char.codePointAt(0) ?? 0)) | 0;
  }
  return LABEL_COLORS[Math.abs(hash) % LABEL_COLORS.length]!;
}

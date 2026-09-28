import { CLASS_KIND_LABELS, type ClassSessionDto, type SubjectDto } from '@nakanune/shared';

type Props = { classes: ClassSessionDto[]; subjectsById: Map<string, SubjectDto> };

export function ClassList({ classes, subjectsById }: Props) {
  return (
    <ul className="space-y-3">
      {classes.map((lesson) => {
        const subject = subjectsById.get(lesson.subjectId);
        const details = [
          lesson.kind && CLASS_KIND_LABELS[lesson.kind],
          lesson.room && `ауд. ${lesson.room}`,
          lesson.teacher,
        ].filter(Boolean);
        return (
          <li key={lesson.id} className="flex gap-3 text-sm">
            <span className="w-24 shrink-0 text-zinc-500 tabular-nums">
              {lesson.startTime}–{lesson.endTime}
            </span>
            <span
              className="mt-1.5 size-2 shrink-0 rounded-full"
              style={{ backgroundColor: subject?.color }}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="font-medium">{subject?.name ?? 'Предмет'}</span>
              {details.length > 0 && (
                <span className="block text-zinc-500">{details.join(' · ')}</span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

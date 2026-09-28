import type { SubjectDto } from '@nakanune/shared';
import { field } from '@/components/ui';

type Props = {
  value: string; // '' — «Без предмета»
  onChange: (value: string) => void;
  subjects: SubjectDto[];
  className?: string;
};

export function SubjectSelect({ value, onChange, subjects, className = '' }: Props) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label="Предмет"
      className={`${field} ${className}`}
    >
      <option value="">Без предмета</option>
      {subjects.map((subject) => (
        <option key={subject.id} value={subject.id}>
          {subject.name}
        </option>
      ))}
    </select>
  );
}

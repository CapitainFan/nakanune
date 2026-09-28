import type { Metadata } from 'next';
import { CalendarView } from '@/components/calendar/CalendarView';

export const metadata: Metadata = { title: 'Календарь' };

export default function CalendarPage() {
  return <CalendarView />;
}

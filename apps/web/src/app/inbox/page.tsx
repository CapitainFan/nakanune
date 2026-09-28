import type { Metadata } from 'next';
import { InboxView } from '@/components/inbox/InboxView';

export const metadata: Metadata = { title: 'Входящие' };

export default function InboxPage() {
  return <InboxView />;
}

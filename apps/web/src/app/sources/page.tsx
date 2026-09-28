import type { Metadata } from 'next';
import { SourcesView } from '@/components/sources/SourcesView';

export const metadata: Metadata = { title: 'Источники' };

export default function SourcesPage() {
  return <SourcesView />;
}

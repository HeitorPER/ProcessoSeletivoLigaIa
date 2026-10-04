import type { Metadata } from 'next';
import Link from 'next/link';
import { ActivityFilters } from '@/components/activities/ActivityFilters';
import { ActivityList } from '@/components/activities/ActivityList';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { parseFilter } from '@/lib/activities/filters';
import { listActivities } from '@/lib/activities/queries';
import { todaySP } from '@/lib/dates';
import { loadMembers } from '@/lib/members';

export const metadata: Metadata = { title: 'Todas as atividades' };

export default async function TodasAtividadesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { filter, values } = parseFilter(await searchParams);
  const today = todaySP();
  const [items, members] = await Promise.all([listActivities(filter, today), loadMembers()]);
  return (
    <>
      <PageHeader
        title="Todas as atividades"
        description="Painel de todas as atividades da Liga. Filtre por responsável, frente, estado e prazo."
        actions={<Link href="/atividades/nova" className="rounded bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark">Nova atividade</Link>}
      />
      <ActivityFilters values={values} members={members} basePath="/atividades" showOwner />
      <p className="mb-3 text-sm text-muted" role="status">{items.length} atividade{items.length === 1 ? '' : 's'} encontrada{items.length === 1 ? '' : 's'}</p>
      {items.length ? <ActivityList items={items} today={today} /> : <EmptyState title="Nenhuma atividade encontrada com esses filtros." />}
    </>
  );
}

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
import { getCurrentMember } from '@/lib/session';

export const metadata: Metadata = { title: 'Minhas atividades' };

export default async function MinhasPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const member = await getCurrentMember();
  const { filter, values } = parseFilter(await searchParams, member.id);
  const today = todaySP();
  const [items, all, members] = await Promise.all([listActivities(filter, today), listActivities({ ownerId: member.id, status: 'open' }, today), loadMembers()]);
  const overdue = all.filter((a) => a.dueDate && a.dueDate < today).length;
  const blocked = all.filter((a) => a.status === 'blocked').length;
  const noDue = all.filter((a) => !a.dueDate).length;
  return (
    <>
      <PageHeader
        title="Minhas atividades"
        description={`O que ${member.displayName} precisa fazer e até quando — inclui tarefas compartilhadas.`}
        actions={<Link href="/atividades/nova" className="rounded bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark">Nova atividade</Link>}
      />
      <p className="mb-4 font-medium">
        {all.length} aberta{all.length === 1 ? '' : 's'} · {overdue} vencida{overdue === 1 ? '' : 's'} · {blocked} bloqueada{blocked === 1 ? '' : 's'} · {noDue} sem prazo
      </p>
      <ActivityFilters values={values} members={members} basePath="/minhas" showOwner={false} />
      {items.length ? (
        <ActivityList items={items} today={today} />
      ) : (
        <EmptyState title="Nenhuma atividade sua com esses filtros.">
          Veja <Link href="/atividades" className="text-brand underline">todas as atividades</Link> ou o <Link href="/comece-aqui" className="text-brand underline">Comece aqui</Link>.
        </EmptyState>
      )}
    </>
  );
}

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
        actions={<Link href="/atividades/nova" className="btn btn-primary">Nova atividade</Link>}
      />
      <ul aria-label="Resumo das suas atividades" className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { n: all.length, label: all.length === 1 ? 'aberta' : 'abertas', tone: 'text-ink' },
          { n: overdue, label: overdue === 1 ? 'vencida' : 'vencidas', tone: overdue ? 'text-danger' : 'text-ink' },
          { n: blocked, label: blocked === 1 ? 'bloqueada' : 'bloqueadas', tone: blocked ? 'text-danger' : 'text-ink' },
          { n: noDue, label: 'sem prazo', tone: 'text-ink' },
        ].map((s) => (
          <li key={s.label} className="card px-4 py-3 md:px-5 md:py-4">
            <span className={`block text-2xl font-semibold ${s.tone}`}>{s.n}</span>
            <span className="text-sm text-muted">{s.label}</span>
          </li>
        ))}
      </ul>
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

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActivityStatusActions } from '@/components/activities/ActivityStatusActions';
import { ActivityTimeline } from '@/components/activities/ActivityTimeline';
import { DueLabel } from '@/components/ui/DueLabel';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { SourceLink } from '@/components/ui/SourceLink';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getActivityDetail } from '@/lib/activities/queries';
import { formatDateTimeBR, todaySP } from '@/lib/dates';
import { loadMembers } from '@/lib/members';

const ORIGIN: Record<string, string> = { import: 'Importada da planilha indicada no INDEX.md', manual: 'Criada manualmente na Central', suggestion: 'Criada a partir de sugestão revisada' };
const RELATION: Record<string, string> = { imported_from: 'importada de', created_by: 'origem da decisão', updated_by: 'alteração baseada em' };

export default async function AtividadePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [a, members] = await Promise.all([getActivityDetail(id), loadMembers()]);
  if (!a) notFound();
  const today = todaySP();
  const creator = a.createdBy === 'system' ? 'Sistema (importação)' : members.find((m) => m.id === a.createdBy)?.displayName ?? a.createdBy;
  const row = (label: string, value: React.ReactNode) => (
    <>
      <dt className="font-medium">{label}</dt>
      <dd className="mb-2">{value}</dd>
    </>
  );
  return (
    <>
      <PageHeader title={a.title} description={<>{a.id} · <StatusBadge status={a.status} /></>} actions={<Link href={`/atividades/${a.id}/editar`} className="rounded bg-brand px-4 py-2 font-semibold text-white hover:bg-brand-dark">Editar</Link>} />
      {a.pendingSuggestions > 0 && (
        <Notice tone="info" title="Há atualização proposta pendente">
          Até a revisão, os dados abaixo continuam sendo os oficiais. <Link href="/sugestoes" className="text-brand underline">Ver sugestões</Link>
          <ul className="mt-1 list-disc pl-5">{a.pending.map((p) => <li key={p.id}>De <SourceLink name={p.sourceName} href={p.sourceUrl} />: “{p.evidence.replace(/\*\*/g, '')}”</li>)}</ul>
        </Notice>
      )}
      {a.hasStaleSource &&
        (a.staleReason === 'error' ? (
          <Notice tone="warn" title="Fonte com erro de leitura">Fonte com erro de leitura — dado pode estar desatualizado. A sincronização tenta ler o arquivo de novo na próxima varredura completa.</Notice>
        ) : (
          <Notice tone="warn" title="Fonte indisponível">Uma fonte desta atividade foi removida ou perdeu acesso. Os dados confirmados abaixo podem estar desatualizados.</Notice>
        ))}

      <dl className="grid max-w-3xl grid-cols-1 gap-x-6 sm:grid-cols-[12rem_1fr]">
        {row('Responsáveis', a.owners.length ? a.owners.map((o) => o.displayName).join(', ') : <span className="italic text-muted">Responsável a confirmar</span>)}
        {row('Prazo', <DueLabel dueDate={a.dueDate} today={today} status={a.status} />)}
        {row('Próximo passo', a.nextStep ?? <span className="italic text-muted">a definir</span>)}
        {row('Frente', a.front ?? '—')}
        {a.status === 'blocked' && row('Motivo do bloqueio', a.blockedReason ?? 'não informado')}
        {row('Descrição', a.description ?? '—')}
        {a.priority && row('Prioridade', a.priority)}
        {a.notes && row('Notas', a.notes)}
        {row('Origem', ORIGIN[a.origin] ?? a.origin)}
        {row('Criada por', `${creator} em ${formatDateTimeBR(a.createdAt)}`)}
        {row('Última atualização', formatDateTimeBR(a.updatedAt))}
      </dl>

      <section className="mt-6" aria-labelledby="acoes"><h2 id="acoes" className="mb-2 text-xl font-semibold">Ações</h2><ActivityStatusActions id={a.id} status={a.status} /></section>

      <section className="mt-8" aria-labelledby="fontes">
        <h2 id="fontes" className="mb-2 text-xl font-semibold">Fontes</h2>
        {a.sources.length ? (
          <ul className="space-y-2">
            {a.sources.map((s) => (
              <li key={s.fileId}>
                <span className="text-sm text-muted">{RELATION[s.relationType] ?? s.relationType}: </span>
                <SourceLink name={s.name} href={s.webUrl} syncStatus={s.syncStatus} />
                {s.sheetOrSection && <span className="text-sm text-muted"> — {s.sheetOrSection}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-muted">Criada na Central, sem documento de origem.</p>}
      </section>

      <section className="mt-8" aria-labelledby="historico"><h2 id="historico" className="mb-2 text-xl font-semibold">Histórico de alterações</h2><ActivityTimeline events={a.events} /></section>
    </>
  );
}

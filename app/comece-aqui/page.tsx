import Link from 'next/link';
import { DueLabel } from '@/components/ui/DueLabel';
import { MarkdownText } from '@/components/ui/MarkdownText';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { SourceLink } from '@/components/ui/SourceLink';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDateTimeBR, todaySP } from '@/lib/dates';
import { getOnboarding } from '@/lib/onboarding';
import { getCurrentMember } from '@/lib/session';

export default async function ComeceAquiPage() {
  const member = await getCurrentMember();
  const today = todaySP();
  const o = await getOnboarding(member.id, today);
  return (
    <>
      <PageHeader title="Comece aqui" description={`Boas-vindas, ${member.displayName}. Em quatro passos você entende a Liga, onde estão as regras e qual é a sua primeira ação.`} />

      {o.gaps.length > 0 && (
        <Notice tone="warn" title="O que ainda não está confirmado">
          <ul className="list-disc pl-5">{o.gaps.map((g) => <li key={g}>{g}</li>)}</ul>
        </Notice>
      )}

      <ol className="space-y-8">
        <li>
          <h2 className="text-xl font-semibold">1. O que é a Liga</h2>
          {o.purpose.provisional && <p className="mt-1 inline-block rounded bg-warn-soft px-2 text-sm font-medium text-warn">Provisório{o.purpose.confirmBy ? ` — a confirmar por ${o.purpose.confirmBy}` : ''}</p>}
          {o.purpose.text ? <MarkdownText text={o.purpose.text} /> : <p className="text-muted">Texto de propósito ainda não disponível.</p>}
          {o.purpose.source && <p className="text-sm">Fonte: <SourceLink name={o.purpose.source.name} href={o.purpose.source.webUrl} syncStatus={o.purpose.source.available ? undefined : 'unavailable'} /></p>}
          <h3 className="mt-4 text-lg font-semibold">Frentes e pessoas</h3>
          {o.fronts.text ? <MarkdownText text={o.fronts.text} /> : <p className="text-muted">Frentes ainda não disponíveis.</p>}
        </li>

        <li>
          <h2 className="text-xl font-semibold">2. Como trabalhamos</h2>
          {o.howWeWork.text ? <MarkdownText text={o.howWeWork.text} /> : <p className="text-muted">Guia inicial ainda não disponível.</p>}
          {o.howWeWork.history.length > 0 && (
            <p className="mt-2 text-sm text-muted">
              Documentos históricos (não valem como regra atual):{' '}
              {o.howWeWork.history.map((h) => <SourceLink key={h.fileId} name={h.name} href={h.webUrl} />)}
            </p>
          )}
        </li>

        <li>
          <h2 className="text-xl font-semibold">3. De onde vêm as tarefas</h2>
          <p className="mt-2 max-w-3xl">
            A lista inicial de atividades veio da aba <strong>{o.activitySource.sheet ?? 'indicada'}</strong> de{' '}
            {o.activitySource.registry ? <SourceLink name={o.activitySource.registry.name} href={o.activitySource.registry.webUrl} /> : 'uma planilha ainda não importada'}
            {o.activitySource.importedAt ? `, importada em ${formatDateTimeBR(o.activitySource.importedAt)}` : ''}. Desde então, o registro oficial fica nesta Central:
          </p>
          <ol className="mt-2 max-w-3xl list-decimal space-y-1 pl-6">
            <li>Uma edição aprovada aqui define o estado oficial da atividade.</li>
            <li>Atas novas geram <Link href="/sugestoes" className="text-brand underline">sugestões</Link> que uma pessoa revisora aceita, ajusta ou rejeita.</li>
            <li>A planilha indicada no INDEX.md foi a base da importação inicial; mudanças nela também viram sugestões.</li>
            <li>Arquivos antigos, rascunhos ou planilhas sem autoridade nunca mudam atividades: aparecem como conflito.</li>
          </ol>
        </li>

        <li>
          <h2 className="text-xl font-semibold">4. Sua primeira ação</h2>
          {o.firstAction ? (
            <div className="mt-2 max-w-3xl rounded border border-line p-4">
              <p className="text-sm text-muted">{o.firstAction.id}</p>
              <p className="text-lg font-semibold"><Link href={`/atividades/${o.firstAction.id}`} className="text-brand underline">{o.firstAction.title}</Link></p>
              <p className="mt-1 flex flex-wrap gap-3"><StatusBadge status={o.firstAction.status} /> <span>Prazo: <DueLabel dueDate={o.firstAction.dueDate} today={today} /></span></p>
              <p className="mt-1">Próximo passo: {o.firstAction.nextStep ?? <span className="italic text-muted">a definir</span>}</p>
              <p className="mt-2"><Link href="/minhas" className="text-brand underline">Ver todas as minhas atividades</Link></p>
            </div>
          ) : (
            <p className="mt-2">Você ainda não tem atividade atribuída. Veja <Link href="/atividades" className="text-brand underline">todas as atividades</Link> e fale com a liderança da sua frente.</p>
          )}
        </li>
      </ol>

      {o.documents.length > 0 && (
        <section className="mt-10" aria-labelledby="docs-ref">
          <h2 id="docs-ref" className="text-xl font-semibold">Documentos de referência</h2>
          <ul className="mt-2 space-y-1">
            {o.documents.map((d) => (
              <li key={d.fileId}>
                <SourceLink name={d.name} href={d.webUrl} syncStatus={d.available ? undefined : 'unavailable'} /> <span className="text-sm text-muted">— {d.kindLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

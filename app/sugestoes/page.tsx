import type { Metadata } from 'next';
import Link from 'next/link';
import { SuggestionCard } from '@/components/suggestions/SuggestionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { SourceLink } from '@/components/ui/SourceLink';
import { loadMembers } from '@/lib/members';
import { getCurrentMember } from '@/lib/session';
import { listDiscarded, listSuggestions } from '@/lib/suggestions/queries';

type Params = { aba?: string; resultado?: string; analisadas?: string; aviso?: string };

const RESULT_LABELS: Record<string, string> = { accepted: 'Aceita', adjusted: 'Ajustada', rejected: 'Rejeitada' };

/** Aviso da última revisão, vindo da URL; só valores conhecidos são exibidos. */
function ResultNotice({ params }: { params: Params }) {
  const r = params.resultado;
  if (r === 'ja-revisada') return <Notice tone="warn" live title="Esta sugestão já tinha sido revisada por outra pessoa." />;
  if (!r || !Object.hasOwn(RESULT_LABELS, r)) return null;
  const analyzed = params.analisadas && /^\d{1,4}$/.test(params.analisadas) ? Number(params.analisadas) : null;
  return (
    <>
      <Notice tone="ok" live title={`Revisão registrada: ${RESULT_LABELS[r]}`}>
        {analyzed !== null && <p>Planilha analisada: {analyzed} nova(s) sugestão(ões) para revisar</p>}
      </Notice>
      {params.aviso === 'analise' && <Notice tone="warn" live title="A revisão foi registrada, mas a análise da planilha falhou; tente novamente mais tarde." />}
    </>
  );
}

export const metadata: Metadata = { title: 'Sugestões para revisar' };

export default async function SugestoesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const tab = params.aba === 'revisadas' ? 'reviewed' : 'pending';
  const viewer = await getCurrentMember();
  const [items, members, discarded] = await Promise.all([listSuggestions(tab, viewer), loadMembers(), listDiscarded()]);
  const tabCls = (active: boolean) => `rounded-full border border-transparent px-4 py-1.5 transition-colors ${active ? 'bg-raised font-semibold text-brand shadow-sm' : 'font-medium text-ink hover:bg-tint'}`;
  const role =
    viewer.role !== 'reviewer'
      ? 'Você pode acompanhar, mas não revisar.'
      : viewer.reviewFronts.length > 0
        ? `Você revisa: ${viewer.reviewFronts.join(', ')} e frentes sem revisor dedicado.`
        : 'Você revisa as frentes sem revisor dedicado.';
  return (
    <>
      <PageHeader
        title="Sugestões para revisar"
        description={<>A IA lê as atas e <strong>só sugere</strong>. Nada muda no registro oficial até uma pessoa revisora aceitar, ajustar ou rejeitar. {role}</>}
      />
      <ResultNotice params={params} />
      <nav aria-label="Abas de sugestões" className="mb-5 inline-flex gap-1 rounded-full bg-tint p-1">
        <Link href="/sugestoes" aria-current={tab === 'pending' ? 'page' : undefined} className={tabCls(tab === 'pending')}>Pendentes</Link>
        <Link href="/sugestoes?aba=revisadas" aria-current={tab === 'reviewed' ? 'page' : undefined} className={tabCls(tab === 'reviewed')}>Revisadas</Link>
      </nav>
      <div id="lista" className="scroll-mt-24">
        {items.length ? (
          <div className="space-y-5">{items.map((s) => <SuggestionCard key={s.id} s={s} members={members} />)}</div>
        ) : (
          <EmptyState title={tab === 'pending' ? 'Nenhuma sugestão pendente.' : 'Nenhuma sugestão revisada ainda.'}>Novas atas na pasta do Drive geram sugestões automaticamente.</EmptyState>
        )}
      </div>
      {tab === 'pending' && discarded.length > 0 && (
        <details className="card mt-6">
          <summary className="cursor-pointer font-semibold">Trechos sem decisão (não viraram atividade) — {discarded.length}</summary>
          <ul className="mt-3 space-y-3">
            {discarded.map((d) => (
              <li key={d.id}>
                <blockquote className="rounded-2xl bg-canvas px-4 py-2 italic">“{d.excerpt.replace(/\*\*/g, '')}”</blockquote>
                <p className="text-sm text-muted">{d.reason} · <SourceLink name={d.sourceName} href={d.sourceUrl} /></p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

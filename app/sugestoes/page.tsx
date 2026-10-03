import Link from 'next/link';
import { SuggestionCard } from '@/components/suggestions/SuggestionCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { SourceLink } from '@/components/ui/SourceLink';
import { loadMembers } from '@/lib/members';
import { getCurrentMember } from '@/lib/session';
import { listDiscarded, listSuggestions } from '@/lib/suggestions/queries';

export default async function SugestoesPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const tab = (await searchParams).aba === 'revisadas' ? 'reviewed' : 'pending';
  const viewer = await getCurrentMember();
  const [items, members, discarded] = await Promise.all([listSuggestions(tab, viewer), loadMembers(), listDiscarded()]);
  const tabCls = (active: boolean) => `rounded-t border-b-4 px-4 py-2 font-medium ${active ? 'border-accent text-brand' : 'border-transparent text-ink hover:bg-surface'}`;
  return (
    <>
      <PageHeader
        title="Sugestões para revisar"
        description={<>A IA lê as atas e <strong>só sugere</strong>. Nada muda no registro oficial até uma pessoa revisora aceitar, ajustar ou rejeitar. {viewer.role === 'reviewer' ? `Você revisa: ${viewer.reviewFronts.join(', ')} e frentes sem revisor dedicado.` : 'Você pode acompanhar, mas não revisar.'}</>}
      />
      <nav aria-label="Abas de sugestões" className="mb-4 flex gap-2 border-b border-line">
        <Link href="/sugestoes" aria-current={tab === 'pending' ? 'page' : undefined} className={tabCls(tab === 'pending')}>Pendentes</Link>
        <Link href="/sugestoes?aba=revisadas" aria-current={tab === 'reviewed' ? 'page' : undefined} className={tabCls(tab === 'reviewed')}>Revisadas</Link>
      </nav>
      {items.length ? (
        <div className="space-y-4">{items.map((s) => <SuggestionCard key={s.id} s={s} members={members} />)}</div>
      ) : (
        <EmptyState title={tab === 'pending' ? 'Nenhuma sugestão pendente.' : 'Nenhuma sugestão revisada ainda.'}>Novas atas na pasta do Drive geram sugestões automaticamente.</EmptyState>
      )}
      {tab === 'pending' && discarded.length > 0 && (
        <details className="mt-8 rounded border border-line p-4">
          <summary className="cursor-pointer font-semibold">Trechos sem decisão (não viraram atividade) — {discarded.length}</summary>
          <ul className="mt-3 space-y-3">
            {discarded.map((d) => (
              <li key={d.id}>
                <blockquote className="border-l-4 border-line pl-3 italic">“{d.excerpt.replace(/\*\*/g, '')}”</blockquote>
                <p className="text-sm text-muted">{d.reason} · <SourceLink name={d.sourceName} href={d.sourceUrl} /></p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

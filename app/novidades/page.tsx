import type { Metadata } from 'next';
import Link from 'next/link';
import { AiSummary } from '@/components/digest/AiSummary';
import { DigestSection } from '@/components/digest/DigestSection';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { SourceLink } from '@/components/ui/SourceLink';
import { getProvider } from '@/lib/ai';
import { RULES_PROVIDER_NAME } from '@/lib/ai/rules';
import { formatDateTimeBR } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { getCurrentMember } from '@/lib/session';
import { buildDigest } from '@/lib/summary/digest';
import { resolvePeriod } from '@/lib/summary/period';
import { touchVisit } from '@/lib/visits';
import { SOURCE_KIND_LABELS, SYNC_STATUS_LABELS, type SourceKind, type SyncStatus } from '@/lib/types';

export const metadata: Metadata = { title: 'Novidades dos documentos' };

export default async function NovidadesPage({ searchParams }: { searchParams: Promise<{ desde?: string }> }) {
  const member = await getCurrentMember();
  const now = new Date();
  const raw = (await searchParams).desde;
  const lastVisit = raw === '7d' || raw === '30d' ? null : await touchVisit(member.id, now);
  const { period, since, label } = resolvePeriod(raw, now, lastVisit);
  const digest = await buildDigest(member.id, since, now);
  const docs = await prisma.source.findMany({ where: { OR: [{ lastProcessedAt: { gt: since } }, { syncStatus: 'unavailable', updatedAt: { gt: since } }] }, orderBy: { updatedAt: 'desc' }, take: 30 });
  const aiEnabled = getProvider().name !== RULES_PROVIDER_NAME && !digest.nothingChanged;

  return (
    <>
      <PageHeader title="Novidades dos documentos" description={`O que mudou para ${member.displayName} ${label}.`} />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="desde" className="text-sm font-medium">Período</label>
          <select id="desde" name="desde" defaultValue={period} className="mt-1 block rounded border border-line px-2 py-2">
            <option value="visita">Desde minha última visita</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
          </select>
        </div>
        <button type="submit" className="rounded border border-brand px-4 py-2 font-semibold text-brand">Atualizar</button>
      </form>

      {digest.nothingChanged ? (
        <Notice tone="ok" title={`Nada mudou para você ${label}.`}>Abaixo, só os prazos e bloqueios que continuam valendo.</Notice>
      ) : (
        <AiSummary key={since.toISOString()} since={since.toISOString()} enabled={aiEnabled} />
      )}

      <DigestSection id="confirmado" title="Confirmado" hint="Mudanças já aplicadas ao registro oficial (aprovadas ou feitas na Central)." items={digest.confirmed} empty="Nenhuma mudança confirmada no período." />
      <DigestSection id="proposto" title="Proposto, aguardando revisão" hint="Sugestões ainda não aprovadas — não valem como oficiais." items={digest.pending} empty="Nenhuma proposta pendente que afete você." />
      <DigestSection id="incerto" title="Incerto ou em conflito" hint="Dados sem evidência suficiente, fontes indisponíveis ou conflitos de fonte." items={digest.uncertain} empty="Nada incerto no momento." />
      <DigestSection id="prazos" title="Prazos próximos e bloqueios" hint="Suas atividades abertas vencidas, com prazo em até 3 dias ou bloqueadas." items={digest.deadlines} empty="Nenhum prazo próximo nem bloqueio." />

      <section aria-labelledby="docs-novos" className="mt-10">
        <h2 id="docs-novos" className="text-xl font-semibold">Documentos novos ou alterados {label}</h2>
        {docs.length === 0 ? <p className="text-muted">Nenhum documento novo ou alterado.</p> : (
          <ul className="mt-2 space-y-2">
            {docs.map((d) => (
              <li key={d.fileId}>
                <SourceLink name={d.name} href={d.webUrl} syncStatus={d.syncStatus} /> — {SOURCE_KIND_LABELS[d.kind as SourceKind] ?? d.kind} · {SYNC_STATUS_LABELS[d.syncStatus as SyncStatus] ?? d.syncStatus}
                {d.lastProcessedAt && <span className="text-sm text-muted"> · {formatDateTimeBR(d.lastProcessedAt)}</span>}
                {d.statusReason && <span className="block text-sm text-muted">{d.statusReason}</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm"><Link href="/sincronizacao" className="text-brand underline">Ver todos os arquivos e o estado da sincronização</Link></p>
      </section>
    </>
  );
}

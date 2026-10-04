import Link from 'next/link';
import { Notice } from '@/components/ui/Notice';
import { ReviewStatusBadge } from '@/components/ui/ReviewStatusBadge';
import { SourceLink } from '@/components/ui/SourceLink';
import { formatDateBR, formatDateTimeBR, toIsoDateSP } from '@/lib/dates';
import type { SuggestionView } from '@/lib/suggestions/queries';
import type { MemberInfo } from '@/lib/types';
import { FieldDiffTable } from './FieldDiffTable';
import { ReviewPanel } from './ReviewPanel';

function heading(s: SuggestionView): string {
  if (s.kind === 'source_conflict') return 'Conflito de fonte';
  if (s.kind === 'create') return `Nova atividade${s.proposedId ? ` (${s.proposedId})` : ''}: ${s.proposedFields.title ?? 'sem título'}`;
  return `Atualizar ${s.targetActivityId} · ${s.targetTitle ?? ''}`;
}

export function SuggestionCard({ s, members }: { s: SuggestionView; members: MemberInfo[] }) {
  const dateLabel = s.source.documentDate ? `documento de ${formatDateBR(s.source.documentDate)}` : `modificado em ${formatDateBR(toIsoDateSP(s.source.modifiedAt))}`;
  return (
    <article id={s.id} aria-labelledby={`${s.id}-h`} className="card scroll-mt-24">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${s.id}-h`} className="text-lg font-semibold">{heading(s)}</h2>
        <ReviewStatusBadge status={s.reviewStatus} />
        {s.front && <span className="text-sm text-muted">Frente: {s.front}</span>}
      </div>

      {s.analysisBlockedReason ? (
        <Notice tone="warn" title="Planilha fora da pasta">
          {s.analysisBlockedReason}. Sem o arquivo não dá para analisar as linhas: descarte o alerta ou, se a planilha voltar para a pasta, a análise fica disponível de novo.
        </Notice>
      ) : (
        s.source.syncStatus === 'unavailable' && <Notice tone="warn" title="Fonte indisponível">O documento foi removido ou perdeu acesso depois desta sugestão. Confira antes de aceitar.</Notice>
      )}

      <FieldDiffTable proposed={s.proposedFields} current={s.currentSnapshot} members={members} showCurrent={s.kind === 'update'} />

      <figure className="my-3 max-w-3xl">
        <blockquote className="rounded-2xl bg-canvas px-4 py-3 italic">“{s.evidence.replace(/\*\*/g, '')}”</blockquote>
        <figcaption className="mt-1 text-sm [overflow-wrap:anywhere]">
          <SourceLink name={s.source.name} href={s.source.webUrl} syncStatus={s.source.syncStatus} /> · {dateLabel}
          {s.evidenceLocator ? ` · ${s.evidenceLocator}` : ''}
        </figcaption>
      </figure>

      <p className="max-w-3xl"><span className="font-medium">Motivo: </span>{s.reason}</p>
      {s.uncertainties.length > 0 && (
        <div className="mt-3 max-w-3xl rounded-2xl bg-warn-soft px-4 py-3">
          <p className="font-semibold text-warn">Incertezas para revisar</p>
          <ul className="list-disc pl-5">{s.uncertainties.map((u) => <li key={u}>{u}</li>)}</ul>
        </div>
      )}

      {s.reviewStatus === 'pending' ? (
        s.canReview ? <ReviewPanel id={s.id} kind={s.kind} proposed={s.proposedFields} members={members} analysisBlocked={s.analysisBlockedReason !== null} /> : <p className="mt-3 text-muted">Aguardando revisão de {s.reviewerNames.join(' ou ') || 'um revisor'}.</p>
      ) : (
        <p className="mt-3 text-sm">
          {s.reviewStatus === 'superseded' ? (
            <>Substituída{s.reviewNote ? `: ${s.reviewNote}` : ''}</>
          ) : (
            <>
              {`${s.reviewStatus === 'rejected' ? 'Rejeitada' : s.reviewStatus === 'adjusted' ? 'Ajustada e aceita' : 'Aceita'} por ${s.reviewerName ?? '—'}`}
              {s.reviewedAt ? ` em ${formatDateTimeBR(s.reviewedAt)}` : ''}
              {s.reviewNote ? ` — “${s.reviewNote}”` : ''}
            </>
          )}
          {s.resultActivityId && <> · <Link href={`/atividades/${s.resultActivityId}`} className="text-brand underline">ver {s.resultActivityId}</Link></>}
        </p>
      )}
    </article>
  );
}

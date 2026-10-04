import type { AIProvider } from '@/lib/ai/types';
import { pickFields } from '@/lib/activity-fields';
import { toFields } from '@/lib/activities/fields';
import { describeChanges, formatFieldValue } from '@/lib/activities/format';
import { listActivities } from '@/lib/activities/queries';
import { addDays, dueInfo, formatDateBR, formatDateTimeBR, todaySP } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { parseJson } from '@/lib/json';
import { loadMembers } from '@/lib/members';
import type { ActivityFields, ActivityPatch } from '@/lib/types';

export interface DigestLink {
  label: string;
  href: string;
  external: boolean;
}
export interface DigestItem {
  key: string;
  title: string;
  detail: string;
  at: Date | null;
  links: DigestLink[];
  tag: string | null;
}
export interface Digest {
  memberId: string;
  since: Date;
  confirmed: DigestItem[];
  pending: DigestItem[];
  uncertain: DigestItem[];
  deadlines: DigestItem[];
  nothingChanged: boolean;
}

const activityLink = (id: string): DigestLink => ({ label: `Abrir ${id}`, href: `/atividades/${id}`, external: false });
const sourceLink = (name: string, url: string): DigestLink => ({ label: `Fonte: ${name}`, href: url, external: true });

export async function buildDigest(memberId: string, since: Date, now: Date = new Date()): Promise<Digest> {
  const members = await loadMembers();
  const today = todaySP(now);
  const all = await listActivities({ status: 'all' }, today);
  const byId = new Map(all.map((a) => [a.id, a]));
  const mine = all.filter((a) => a.ownerIds.includes(memberId));
  const mineIds = new Set(mine.map((a) => a.id));
  const sources = new Map((await prisma.source.findMany()).map((s) => [s.fileId, s]));

  const confirmed: DigestItem[] = [];
  const events = await prisma.activityEvent.findMany({ where: { timestamp: { gt: since } }, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }] });
  for (const e of events) {
    const before = parseJson<ActivityPatch>(e.before, {});
    const after = parseJson<ActivityPatch>(e.after, {});
    const touchesMe = mineIds.has(e.activityId) || before.ownerIds?.includes(memberId) || after.ownerIds?.includes(memberId);
    if (!touchesMe) continue;
    const keys = parseJson<(keyof ActivityFields)[]>(e.changedFields, []);
    const src = e.sourceFileId ? sources.get(e.sourceFileId) : undefined;
    const detail =
      e.type === 'import' ? 'Atividade importada do registro inicial' : e.type === 'create' ? 'Atividade criada' : describeChanges(before, after, keys, members).join('; ');
    confirmed.push({
      key: `event-${e.id}`,
      title: `${e.activityId} · ${byId.get(e.activityId)?.title ?? ''}`,
      detail: e.reason ? `${detail}. Motivo: ${e.reason}` : detail,
      at: e.timestamp,
      tag: e.actorId === 'system' ? 'Sistema' : members.find((m) => m.id === e.actorId)?.displayName ?? e.actorId,
      links: [activityLink(e.activityId), ...(src ? [sourceLink(src.name, src.webUrl)] : [])],
    });
  }

  const pending: DigestItem[] = [];
  const uncertain: DigestItem[] = [];
  const suggestions = await prisma.suggestion.findMany({
    where: { reviewStatus: 'pending' },
    include: { source: true, target: { include: { owners: true } } },
    orderBy: { createdAt: 'desc' },
  });
  for (const s of suggestions) {
    const links = [{ label: 'Revisar sugestão', href: `/sugestoes#${s.id}`, external: false }, sourceLink(s.source.name, s.source.webUrl)];
    if (s.kind === 'source_conflict') {
      uncertain.push({ key: `conflict-${s.id}`, title: 'Conflito de fonte aguardando decisão', detail: `${s.evidence}. Nenhuma atividade foi alterada.`, at: s.createdAt, tag: 'Conflito', links });
      continue;
    }
    const proposed = parseJson<ActivityPatch>(s.proposedFields, {});
    const affects = (s.targetActivityId && mineIds.has(s.targetActivityId)) || proposed.ownerIds?.includes(memberId);
    if (!affects) continue;
    const keys = Object.keys(proposed) as (keyof ActivityFields)[];
    const uncertainties = parseJson<string[]>(s.uncertainties, []);
    // pendente: compara com o oficial de agora (como em /sugestoes), não com a foto do momento da sugestão
    const officialNow = s.target ? pickFields(toFields(s.target), keys) : parseJson<ActivityPatch>(s.currentSnapshot, {});
    const detail =
      s.kind === 'update'
        ? describeChanges(officialNow, proposed, keys, members).join('; ')
        : `responsáveis: ${formatFieldValue('ownerIds', proposed.ownerIds, members)}; prazo: ${formatFieldValue('dueDate', proposed.dueDate, members)}`;
    const title = s.kind === 'create' ? `Nova atividade proposta: ${proposed.title ?? '(sem título)'}` : `${s.targetActivityId} · ${byId.get(s.targetActivityId!)?.title ?? ''}`;
    pending.push({ key: `suggestion-${s.id}`, title, detail, at: s.createdAt, tag: 'Aguardando revisão', links });
    if (uncertainties.length) uncertain.push({ key: `uncertain-${s.id}`, title, detail: uncertainties.join('; '), at: s.createdAt, tag: 'Incerto', links });
  }

  const deadlines: DigestItem[] = [];
  const soonLimit = addDays(today, 3);
  for (const a of mine) {
    if (a.status === 'done') continue;
    if (a.hasStaleSource) {
      const stale = a.sources.filter((x) => x.syncStatus !== 'processed' && x.syncStatus !== 'ignored');
      const label = a.staleReason === 'error' ? 'Fonte com erro de leitura' : 'Fonte indisponível';
      uncertain.push({
        key: `stale-${a.id}`, title: `${a.id} · ${a.title}`, at: a.updatedAt, tag: label,
        detail: `${label} (${stale.map((x) => x.name).join(', ')}): o dado confirmado em ${formatDateTimeBR(a.updatedAt)} pode estar desatualizado`,
        links: [activityLink(a.id)],
      });
    }
    if (!a.dueDate) {
      uncertain.push({ key: `nodue-${a.id}`, title: `${a.id} · ${a.title}`, detail: 'Prazo a definir', at: null, tag: 'Sem prazo', links: [activityLink(a.id)] });
    }
    const due = dueInfo(a.dueDate, today);
    if (a.status === 'blocked' || (a.dueDate && a.dueDate <= soonLimit)) {
      const parts = [];
      if (a.dueDate) parts.push(`${formatDateBR(a.dueDate)} · ${due.label}`);
      if (a.status === 'blocked') parts.push(`Bloqueada: ${a.blockedReason ?? 'motivo não informado'}`);
      deadlines.push({ key: `deadline-${a.id}`, title: `${a.id} · ${a.title}`, detail: parts.join(' — '), at: null, tag: a.status === 'blocked' ? 'Bloqueada' : due.tone === 'overdue' ? 'Vencida' : 'Prazo próximo', links: [activityLink(a.id)] });
    }
  }

  return { memberId, since, confirmed, pending, uncertain, deadlines, nothingChanged: confirmed.length === 0 && pending.length === 0 };
}

export function digestToFacts(d: Digest, memberName: string): string {
  const block = (label: string, items: DigestItem[]) => (items.length ? [`${label}:`, ...items.map((i) => `- ${i.title} — ${i.detail}`)] : [`${label}: nada`]);
  return [
    `Membro: ${memberName}. Período: desde ${formatDateTimeBR(d.since)}.`,
    ...block('CONFIRMADO', d.confirmed),
    ...block('PROPOSTO (aguardando revisão humana)', d.pending),
    ...block('INCERTO OU EM CONFLITO', d.uncertain),
    ...block('PRAZOS PRÓXIMOS E BLOQUEIOS', d.deadlines),
  ].join('\n');
}

export async function summarizeDigest(d: Digest, memberName: string, provider: AIProvider): Promise<string | null> {
  if (d.nothingChanged) return null;
  try {
    return await provider.summarize(digestToFacts(d, memberName));
  } catch {
    return null;
  }
}

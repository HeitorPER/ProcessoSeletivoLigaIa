import { sameFieldValue } from '@/lib/activity-fields';
import { formatDateBR, isIsoDate, MONTHS_PT } from '@/lib/dates';
import { escapeRegExp, jaccard, normalizeForMatch, normalizeName, tokenize } from '@/lib/text';
import { ACTIVITY_STATUSES, FRONTS, type ActivityFields, type ActivityPatch, type ActivitySnapshot, type DiscardedExcerpt, type MemberInfo, type ProposedSuggestion } from '@/lib/types';
import type { RawExtractionItem } from './types';

export interface ValidationContext {
  text: string;
  sections?: { heading: string; text: string }[];
  activities: ActivitySnapshot[];
  members: MemberInfo[];
}
export interface ValidationResult {
  suggestions: ProposedSuggestion[];
  discarded: DiscardedExcerpt[];
  dropped: { item: RawExtractionItem; reason: string }[];
}

const MIN_EVIDENCE = 12;

export function evidenceIsLiteral(evidence: string, text: string): boolean {
  const ev = normalizeForMatch(evidence);
  return ev.length >= MIN_EVIDENCE && normalizeForMatch(text).includes(ev);
}

export function dateMentioned(iso: string, evidence: string): boolean {
  const [y, m, d] = iso.split('-');
  const plain = normalizeForMatch(evidence);
  const dn = String(Number(d));
  const mn = String(Number(m));
  const patterns = [iso, `${d}/${m}`, `${dn}/${mn}`, `${d}/${m}/${y}`, `${dn} de ${MONTHS_PT[Number(m) - 1]}`];
  // Limites de dígitos: "7/10" não pode casar dentro de "17/10", nem "07/10" dentro de "107/10".
  return patterns.some((p) => new RegExp(`(^|[^\\d])${escapeRegExp(p)}([^\\d]|$)`).test(plain));
}

/** O nome aparece como palavra inteira no trecho (ignora acentos, caixa e markdown). */
function nameInEvidence(displayName: string, evidence: string): boolean {
  const name = normalizeForMatch(displayName);
  if (!name) return false;
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(name)}([^a-z0-9]|$)`).test(normalizeForMatch(evidence));
}

const STATUS_CUES = /bloque|conclu|finaliz|andamento|inici|retom|paus/;

/** Remove responsáveis que o trecho não cita e registra a incerteza. */
function groundOwners(fields: ActivityPatch, evidence: string, members: MemberInfo[], uncertainties: string[]): void {
  if (!fields.ownerIds) return;
  const kept: string[] = [];
  for (const id of fields.ownerIds) {
    const member = members.find((m) => m.id === id);
    if (member && nameInEvidence(member.displayName, evidence)) kept.push(id);
    else uncertainties.push(`Responsável "${member?.displayName ?? id}" não aparece no trecho — a confirmar`);
  }
  if (kept.length) fields.ownerIds = kept;
  else delete fields.ownerIds;
}

function checkStatusCue(fields: ActivityPatch, evidence: string, uncertainties: string[]): void {
  if (fields.status && !STATUS_CUES.test(normalizeForMatch(evidence))) {
    uncertainties.push('Mudança de estado sem menção explícita no trecho — confirme');
  }
}

function sectionsOf(text: string): { heading: string; text: string }[] {
  const out: { heading: string; text: string }[] = [];
  let heading = '';
  let buf: string[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^#{1,6}\s+(.*?)\s*$/.exec(line);
    if (m) {
      out.push({ heading, text: buf.join('\n') });
      heading = m[1];
      buf = [];
    } else buf.push(line);
  }
  out.push({ heading, text: buf.join('\n') });
  return out;
}

function locate(evidence: string, ctx: ValidationContext): string | null {
  const needle = normalizeForMatch(evidence);
  const sections = ctx.sections ?? sectionsOf(ctx.text);
  return sections.find((s) => s.heading && normalizeForMatch(s.text).includes(needle))?.heading ?? null;
}

function findSimilar(fields: ActivityPatch, activities: ActivitySnapshot[]): ActivitySnapshot | null {
  if (!fields.title) return null;
  const t = tokenize(fields.title);
  return (
    activities.find((a) => {
      const sameOwner = !fields.ownerIds?.length || a.ownerIds.some((o) => fields.ownerIds!.includes(o));
      return sameOwner && jaccard(t, tokenize(a.title)) >= 0.5;
    }) ?? null
  );
}

export function validateItems(items: RawExtractionItem[], ctx: ValidationContext): ValidationResult {
  const result: ValidationResult = { suggestions: [], discarded: [], dropped: [] };

  for (const item of items) {
    const evidence = (item.evidence ?? '').trim();
    if (!evidenceIsLiteral(evidence, ctx.text)) {
      result.dropped.push({ item, reason: 'Evidência não encontrada literalmente no documento' });
      continue;
    }
    if (item.kind === 'no_action') {
      result.discarded.push({ excerpt: evidence, reason: item.reason || 'Sem decisão explícita' });
      continue;
    }

    const uncertainties = [...(item.uncertainties ?? [])];
    let kind: 'create' | 'update' = item.kind;
    let target = item.target_activity_id ? ctx.activities.find((a) => a.id === item.target_activity_id) : undefined;

    if (kind === 'update' && !target) {
      result.dropped.push({ item, reason: `Atividade ${item.target_activity_id ?? '(sem ID)'} não existe no registro` });
      continue;
    }
    if (kind === 'create') {
      const mentioned = (evidence.match(/ACT-[\w-]+/g) ?? []).map((id) => ctx.activities.find((a) => a.id === id)).find(Boolean);
      if (mentioned) {
        kind = 'update';
        target = mentioned;
        uncertainties.push(`A IA propôs criar, mas o trecho cita ${mentioned.id}; convertido em atualização`);
      }
    }

    const fields: ActivityPatch = {};
    if (item.title?.trim()) fields.title = item.title.trim();
    if (item.next_step?.trim()) fields.nextStep = item.next_step.trim();
    if (item.status && (ACTIVITY_STATUSES as readonly string[]).includes(item.status)) fields.status = item.status;
    if (item.front) {
      const front = FRONTS.find((f) => normalizeName(f) === normalizeName(item.front!));
      if (front) fields.front = front;
      else uncertainties.push(`Frente "${item.front}" não reconhecida — a confirmar`);
    }
    if (item.due_date) {
      if (!isIsoDate(item.due_date)) uncertainties.push(`Prazo "${item.due_date}" em formato inválido — a confirmar`);
      else if (!dateMentioned(item.due_date, evidence)) uncertainties.push(`Prazo ${formatDateBR(item.due_date)} não aparece no trecho — a confirmar`);
      else fields.dueDate = item.due_date;
    }
    if (item.owner_ids?.length) {
      const valid = item.owner_ids.filter((id) => ctx.members.some((m) => m.id === id));
      for (const id of item.owner_ids.filter((id) => !valid.includes(id))) uncertainties.push(`Responsável "${id}" não reconhecido — a confirmar`);
      if (valid.length) fields.ownerIds = valid;
    }

    const evidenceLocator = locate(evidence, ctx);

    if (kind === 'update') {
      if (fields.title) delete fields.title; // atualização não renomeia a atividade a partir de uma ata
      for (const key of Object.keys(fields) as (keyof ActivityFields)[]) {
        if (sameFieldValue(key, fields[key], target![key])) delete fields[key];
      }
      groundOwners(fields, evidence, ctx.members, uncertainties);
      checkStatusCue(fields, evidence, uncertainties);
      if (Object.keys(fields).length === 0) {
        result.dropped.push({ item, reason: 'Nenhuma mudança em relação ao registro oficial' });
        continue;
      }
      result.suggestions.push({ kind: 'update', targetActivityId: target!.id, proposedFields: fields, evidence, evidenceLocator, reason: item.reason, uncertainties, front: target!.front });
      continue;
    }

    if (!fields.title) {
      result.dropped.push({ item, reason: 'Criação sem título' });
      continue;
    }
    groundOwners(fields, evidence, ctx.members, uncertainties);
    checkStatusCue(fields, evidence, uncertainties);
    if (!fields.ownerIds) uncertainties.push('Responsável não indicado no documento — a confirmar');
    if (!fields.dueDate && !item.due_date) uncertainties.push('Prazo não indicado no documento — ficará "a definir"');
    const dup = findSimilar(fields, ctx.activities);
    if (dup) uncertainties.push(`Possível duplicata de ${dup.id} (${dup.title})`);
    if (!fields.front && fields.ownerIds?.length) {
      const inferred = ctx.members.find((m) => m.id === fields.ownerIds![0])?.front;
      if (inferred) {
        fields.front = inferred;
        uncertainties.push(`Frente inferida pela frente do responsável (${inferred}) — confirme`);
      }
    }
    fields.status = fields.status ?? 'todo';
    result.suggestions.push({ kind: 'create', targetActivityId: null, proposedFields: fields, evidence, evidenceLocator, reason: item.reason, uncertainties, front: fields.front ?? null });
  }
  return result;
}

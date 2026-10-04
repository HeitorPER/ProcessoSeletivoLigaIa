import type { ActivityFields, ActivityPatch } from '@/lib/types';
import { textSimilar } from '@/lib/text';

export const FIELD_KEYS: (keyof ActivityFields)[] = ['title', 'description', 'nextStep', 'front', 'status', 'dueDate', 'priority', 'notes', 'blockedReason', 'ownerIds'];
const TEXT_KEYS = new Set<keyof ActivityFields>(['title', 'description', 'nextStep', 'notes', 'blockedReason']);

export function emptyFields(): ActivityFields {
  return { title: '', description: null, nextStep: null, front: null, status: 'todo', dueDate: null, priority: null, notes: null, blockedReason: null, ownerIds: [] };
}

function sortedIds(v: unknown): string[] {
  return [...((v as string[] | null | undefined) ?? [])].sort();
}

export function fieldsEqualStrict(key: keyof ActivityFields, a: unknown, b: unknown): boolean {
  if (key === 'ownerIds') {
    const x = sortedIds(a);
    const y = sortedIds(b);
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return (a ?? null) === (b ?? null);
}

/** Comparação tolerante: usada para decidir se uma proposta (IA/planilha) realmente muda o oficial. */
export function sameFieldValue(key: keyof ActivityFields, a: unknown, b: unknown): boolean {
  if (TEXT_KEYS.has(key)) return textSimilar((a as string | null | undefined) ?? null, (b as string | null | undefined) ?? null);
  return fieldsEqualStrict(key, a, b);
}

/** Campos presentes em `after` cujo valor difere de `before` (comparação estrita). */
export function diffFields(before: ActivityPatch, after: ActivityPatch): (keyof ActivityFields)[] {
  return FIELD_KEYS.filter((k) => k in after && after[k] !== undefined && !fieldsEqualStrict(k, before[k], after[k]));
}

export function pickFields(obj: ActivityPatch, keys: (keyof ActivityFields)[]): ActivityPatch {
  const out: ActivityPatch = {};
  for (const k of keys) if (k in obj) (out as Record<string, unknown>)[k] = obj[k];
  return out;
}

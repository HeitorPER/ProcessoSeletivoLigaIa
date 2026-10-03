import { formatDateBR } from '@/lib/dates';
import { STATUS_LABELS, type ActivityFields, type ActivityPatch, type ActivityStatus, type MemberInfo } from '@/lib/types';

export const FIELD_LABELS: Record<keyof ActivityFields, string> = {
  title: 'título',
  description: 'descrição',
  nextStep: 'próximo passo',
  front: 'frente',
  status: 'estado',
  dueDate: 'prazo',
  priority: 'prioridade',
  notes: 'notas',
  blockedReason: 'motivo do bloqueio',
  ownerIds: 'responsáveis',
};

export function formatFieldValue(key: keyof ActivityFields, value: unknown, members: MemberInfo[]): string {
  if (key === 'dueDate') return value ? formatDateBR(value as string) : 'a definir';
  if (key === 'status') return value ? STATUS_LABELS[value as ActivityStatus] : '—';
  if (key === 'ownerIds') {
    const ids = (value as string[] | null | undefined) ?? [];
    return ids.length ? ids.map((id) => members.find((m) => m.id === id)?.displayName ?? id).join(', ') : 'a confirmar';
  }
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

export function describeChanges(before: ActivityPatch, after: ActivityPatch, keys: (keyof ActivityFields)[], members: MemberInfo[]): string[] {
  return keys.map((k) => `${FIELD_LABELS[k]}: ${formatFieldValue(k, before[k], members)} → ${formatFieldValue(k, after[k], members)}`);
}

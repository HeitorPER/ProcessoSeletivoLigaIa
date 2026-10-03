import { isIsoDate } from '@/lib/dates';
import { ACTIVITY_STATUSES, FRONTS, type ActivityFields, type ActivityStatus, type MemberInfo } from '@/lib/types';

export interface ActivityRow {
  title: string;
  description: string | null;
  nextStep: string | null;
  front: string | null;
  status: string;
  dueDate: string | null;
  priority: string | null;
  notes: string | null;
  blockedReason: string | null;
  owners: { memberId: string }[];
}

export function toFields(row: ActivityRow): ActivityFields {
  return {
    title: row.title,
    description: row.description,
    nextStep: row.nextStep,
    front: row.front,
    status: row.status as ActivityStatus,
    dueDate: row.dueDate,
    priority: row.priority,
    notes: row.notes,
    blockedReason: row.blockedReason,
    ownerIds: row.owners.map((o) => o.memberId).sort(),
  };
}

export function validateFields(f: ActivityFields, members: MemberInfo[]): string[] {
  const errors: string[] = [];
  if (!f.title || !f.title.trim()) errors.push('Informe o título da atividade');
  else if (f.title.length > 200) errors.push('O título deve ter no máximo 200 caracteres');
  if (!(ACTIVITY_STATUSES as readonly string[]).includes(f.status)) errors.push(`Estado inválido: ${f.status}`);
  if (f.dueDate !== null && !isIsoDate(f.dueDate)) errors.push('Prazo deve ser uma data válida (AAAA-MM-DD) ou ficar vazio');
  if (f.front !== null && !(FRONTS as readonly string[]).includes(f.front)) errors.push(`Frente desconhecida: ${f.front}`);
  for (const id of f.ownerIds) if (!members.some((m) => m.id === id)) errors.push(`Responsável desconhecido: ${id}`);
  return errors;
}

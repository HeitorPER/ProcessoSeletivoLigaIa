import { z } from 'zod';
import { ACTIVITY_STATUSES, FRONTS, type ActivityFields, type ActivityPatch } from '@/lib/types';

const BLOCKED_REASON_REQUIRED = 'Informe o motivo do bloqueio';

const text = (label: string, max: number) =>
  z
    .string({ error: `${label}: informe um texto` })
    .trim()
    .max(max, { error: `${label}: no máximo ${max} caracteres` })
    .nullable()
    .optional();

const fields = {
  title: z
    .string({ error: 'Informe o título da atividade' })
    .trim()
    .min(1, { error: 'Informe o título da atividade' })
    .max(200, { error: 'O título deve ter no máximo 200 caracteres' }),
  description: text('Descrição', 2000),
  nextStep: text('Próximo passo', 500),
  front: z.union([z.enum(FRONTS), z.literal(''), z.null()], { error: `Frente inválida: escolha ${FRONTS.join(', ')} ou deixe em branco` }).optional(),
  status: z.enum(ACTIVITY_STATUSES, { error: 'Estado inválido' }),
  dueDate: z
    .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Prazo deve estar no formato AAAA-MM-DD' }), z.literal(''), z.null()], {
      error: 'Prazo deve estar no formato AAAA-MM-DD',
    })
    .optional(),
  ownerIds: z.array(z.string({ error: 'Responsável inválido' }), { error: 'Responsáveis: envie uma lista de identificadores' }).optional(),
  blockedReason: text('Motivo do bloqueio', 500),
  priority: text('Prioridade', 50),
  notes: text('Notas', 2000),
  reason: z.string({ error: 'Motivo da alteração: informe um texto' }).trim().max(500, { error: 'Motivo da alteração: no máximo 500 caracteres' }).optional(),
};

const BODY_ERROR = { error: 'Corpo da requisição inválido: envie um objeto JSON' };

export const activityInputSchema = z.object(fields, BODY_ERROR);
export const activityPatchSchema = z.object(fields, BODY_ERROR).partial();

type Input = z.infer<typeof activityPatchSchema>;
const nil = (v: string | null | undefined) => (v === undefined ? undefined : v === null || v.trim() === '' ? null : v.trim());

export function toActivityPatch(data: Input): ActivityPatch {
  const patch: ActivityPatch = {};
  if (data.title !== undefined) patch.title = data.title.trim();
  if (data.description !== undefined) patch.description = nil(data.description) ?? null;
  if (data.nextStep !== undefined) patch.nextStep = nil(data.nextStep) ?? null;
  if (data.front !== undefined) patch.front = data.front || null;
  if (data.status !== undefined) patch.status = data.status;
  if (data.dueDate !== undefined) patch.dueDate = data.dueDate || null;
  if (data.ownerIds !== undefined) patch.ownerIds = data.ownerIds;
  if (data.blockedReason !== undefined) patch.blockedReason = nil(data.blockedReason) ?? null;
  if (data.priority !== undefined) patch.priority = nil(data.priority) ?? null;
  if (data.notes !== undefined) patch.notes = nil(data.notes) ?? null;
  return patch;
}

export function toActivityFields(data: z.infer<typeof activityInputSchema>): ActivityFields {
  const p = toActivityPatch(data);
  return {
    title: p.title!, description: p.description ?? null, nextStep: p.nextStep ?? null, front: p.front ?? null,
    status: p.status!, dueDate: p.dueDate ?? null, priority: p.priority ?? null, notes: p.notes ?? null,
    blockedReason: p.blockedReason ?? null, ownerIds: p.ownerIds ?? [],
  };
}

/** Ao definir um estado diferente de "bloqueada", o motivo do bloqueio é descartado. */
export function normalizeBlocked<T extends ActivityPatch>(patch: T): T {
  if (patch.status !== undefined && patch.status !== 'blocked') return { ...patch, blockedReason: null };
  return patch;
}

/** Estado efetivo (atual + alteração): bloqueada exige motivo preenchido. */
export function blockedReasonError(current: Pick<ActivityFields, 'status' | 'blockedReason'> | null, patch: ActivityPatch): string | null {
  const status = patch.status !== undefined ? patch.status : current?.status;
  if (status !== 'blocked') return null;
  const reason = patch.blockedReason !== undefined ? patch.blockedReason : current?.blockedReason;
  return reason && reason.trim() ? null : BLOCKED_REASON_REQUIRED;
}

export function zodErrors(e: z.ZodError): string[] {
  return e.issues.map((i) => i.message);
}

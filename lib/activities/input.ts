import { z } from 'zod';
import { ACTIVITY_STATUSES, FRONTS, type ActivityFields, type ActivityPatch } from '@/lib/types';

const optText = (max: number) => z.string().trim().max(max).nullable().optional();

const fields = {
  title: z.string().trim().min(1, { error: 'Informe o título da atividade' }).max(200, { error: 'O título deve ter no máximo 200 caracteres' }),
  description: optText(2000),
  nextStep: optText(500),
  front: z.union([z.enum(FRONTS), z.literal(''), z.null()]).optional(),
  status: z.enum(ACTIVITY_STATUSES, { error: 'Estado inválido' }),
  dueDate: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Prazo deve estar no formato AAAA-MM-DD' }), z.literal(''), z.null()]).optional(),
  ownerIds: z.array(z.string()).optional(),
  blockedReason: optText(500),
  priority: optText(50),
  notes: optText(2000),
  reason: z.string().trim().max(500).optional(),
};

export const activityInputSchema = z.object(fields);
export const activityPatchSchema = z.object(fields).partial();

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

export function zodErrors(e: z.ZodError): string[] {
  return e.issues.map((i) => i.message);
}

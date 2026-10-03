import { diffFields, pickFields } from '@/lib/activity-fields';
import { prisma, type Db } from '@/lib/db';
import { loadMembers } from '@/lib/members';
import type { ActivityFields, ActivityPatch, ActivitySnapshot } from '@/lib/types';
import { toFields, validateFields } from './fields';

export class ValidationError extends Error {
  constructor(public errors: string[]) {
    super(errors.join('; '));
  }
}
export class NotFoundError extends Error {
  constructor(id: string) {
    super(`Atividade ${id} não encontrada`);
  }
}

export interface CreateOptions {
  id?: string;
  origin: 'import' | 'manual' | 'suggestion';
  reason?: string;
  sourceFileId?: string;
  suggestionId?: string;
  reference?: { sheetOrSection?: string | null; quoteOrCell?: string | null; versionOrHash?: string };
  db?: Db;
}
export interface UpdateOptions {
  reason?: string;
  sourceFileId?: string;
  suggestionId?: string;
  type?: 'update' | 'status' | 'suggestion_applied';
  db?: Db;
}

function inTransaction<T>(db: Db | undefined, fn: (db: Db) => Promise<T>): Promise<T> {
  return db ? fn(db) : prisma.$transaction((tx) => fn(tx));
}

function clean(f: ActivityFields): ActivityFields {
  const t = (v: string | null) => (v && v.trim() ? v.trim() : null);
  return {
    ...f,
    title: (f.title ?? '').trim(),
    description: t(f.description),
    nextStep: t(f.nextStep),
    priority: t(f.priority),
    notes: t(f.notes),
    blockedReason: t(f.blockedReason),
    ownerIds: [...new Set(f.ownerIds ?? [])].sort(),
  };
}

export async function nextManualId(db: Db): Promise<string> {
  const rows = await db.activity.findMany({ where: { id: { startsWith: 'ACT-M-' } }, select: { id: true } });
  const max = rows.reduce((acc, r) => Math.max(acc, Number(r.id.slice('ACT-M-'.length)) || 0), 0);
  return `ACT-M-${String(max + 1).padStart(3, '0')}`;
}

export async function getActivitySnapshot(id: string, db: Db = prisma): Promise<ActivitySnapshot | null> {
  const row = await db.activity.findUnique({ where: { id }, include: { owners: true } });
  return row ? { id: row.id, ...toFields(row) } : null;
}

export async function listActivitySnapshots(db: Db = prisma): Promise<ActivitySnapshot[]> {
  const rows = await db.activity.findMany({ include: { owners: true }, orderBy: { id: 'asc' } });
  return rows.map((r) => ({ id: r.id, ...toFields(r) }));
}

export async function createActivity(input: ActivityFields, actorId: string, opts: CreateOptions): Promise<ActivitySnapshot> {
  return inTransaction(opts.db, async (db) => {
    const fields = clean(input);
    const errors = validateFields(fields, await loadMembers(db));
    if (opts.id && (await db.activity.findUnique({ where: { id: opts.id } }))) errors.push(`Já existe uma atividade com o ID ${opts.id}`);
    if (errors.length) throw new ValidationError(errors);

    const id = opts.id ?? (await nextManualId(db));
    const { ownerIds, ...scalar } = fields;
    await db.activity.create({
      data: { id, ...scalar, origin: opts.origin, createdBy: actorId, owners: { create: ownerIds.map((memberId) => ({ memberId })) } },
    });
    await db.activityEvent.create({
      data: {
        activityId: id, actorId, type: opts.origin === 'import' ? 'import' : 'create',
        before: null, after: JSON.stringify(fields), changedFields: JSON.stringify(Object.keys(fields)),
        reason: opts.reason ?? null, sourceFileId: opts.sourceFileId ?? null, suggestionId: opts.suggestionId ?? null,
      },
    });
    if (opts.origin === 'import' && opts.sourceFileId) {
      const source = await db.source.findUnique({ where: { fileId: opts.sourceFileId } });
      await db.reference.create({
        data: {
          activityId: id, fileId: opts.sourceFileId, relationType: 'imported_from',
          versionOrHash: opts.reference?.versionOrHash ?? source?.versionOrHash ?? '',
          sheetOrSection: opts.reference?.sheetOrSection ?? null, quoteOrCell: opts.reference?.quoteOrCell ?? null,
        },
      });
    }
    return { id, ...fields };
  });
}

export async function updateActivity(
  id: string,
  patch: ActivityPatch,
  actorId: string,
  opts: UpdateOptions = {},
): Promise<{ activity: ActivitySnapshot; changedFields: (keyof ActivityFields)[] }> {
  return inTransaction(opts.db, async (db) => {
    const current = await db.activity.findUnique({ where: { id }, include: { owners: true } });
    if (!current) throw new NotFoundError(id);
    const before = toFields(current);
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as ActivityPatch;
    const after = clean({ ...before, ...defined });
    const errors = validateFields(after, await loadMembers(db));
    if (errors.length) throw new ValidationError(errors);

    const changed = diffFields(before, after);
    if (changed.length === 0) return { activity: { id, ...before }, changedFields: [] };

    const { ownerIds, ...scalar } = after;
    await db.activity.update({ where: { id }, data: scalar });
    if (changed.includes('ownerIds')) {
      await db.activityOwner.deleteMany({ where: { activityId: id } });
      for (const memberId of ownerIds) await db.activityOwner.create({ data: { activityId: id, memberId } });
    }
    const type = opts.type ?? (changed.length === 1 && changed[0] === 'status' ? 'status' : 'update');
    await db.activityEvent.create({
      data: {
        activityId: id, actorId, type,
        before: JSON.stringify(pickFields(before, changed)), after: JSON.stringify(pickFields(after, changed)),
        changedFields: JSON.stringify(changed), reason: opts.reason ?? null,
        sourceFileId: opts.sourceFileId ?? null, suggestionId: opts.suggestionId ?? null,
      },
    });
    return { activity: { id, ...after }, changedFields: changed };
  });
}

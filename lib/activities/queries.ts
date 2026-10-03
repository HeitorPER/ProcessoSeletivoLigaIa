import { addDays } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { parseJson } from '@/lib/json';
import { loadMembers } from '@/lib/members';
import type { ActivityFields, ActivityPatch, ActivitySnapshot, ActivityStatus } from '@/lib/types';
import { toFields } from './fields';
import { describeChanges } from './format';

export type DueFilter = 'overdue' | 'week' | 'none' | 'all';
export interface ActivityFilter {
  ownerId?: string;
  front?: string;
  status?: ActivityStatus | 'open' | 'all';
  due?: DueFilter;
}
export interface SourceRef {
  fileId: string;
  name: string;
  webUrl: string;
  syncStatus: string;
  relationType: string;
  sheetOrSection: string | null;
  quoteOrCell: string | null;
}
export interface ActivityListItem extends ActivitySnapshot {
  owners: { id: string; displayName: string }[];
  pendingSuggestions: number;
  sources: SourceRef[];
  hasStaleSource: boolean;
  origin: string;
  updatedAt: Date;
}
export interface ActivityEventView {
  id: number;
  actorName: string;
  timestamp: Date;
  type: string;
  changes: string[];
  reason: string | null;
  source: { name: string; webUrl: string; syncStatus: string } | null;
}
export interface ActivityDetail extends ActivityListItem {
  createdBy: string;
  createdAt: Date;
  events: ActivityEventView[];
  pending: { id: string; kind: string; proposedFields: ActivityPatch; evidence: string; sourceName: string; sourceUrl: string }[];
}

const STALE = new Set(['unavailable', 'error', 'stale']);

function fetchRows(where: { id?: string } = {}) {
  return prisma.activity.findMany({
    where,
    include: {
      owners: { include: { member: true } },
      references: { include: { source: true }, orderBy: { createdAt: 'asc' } },
      suggestions: { where: { reviewStatus: 'pending' }, include: { source: true } },
    },
  });
}
type Row = Awaited<ReturnType<typeof fetchRows>>[number];

function toListItem(r: Row): ActivityListItem {
  const sources = new Map<string, SourceRef>();
  for (const ref of r.references) {
    if (!sources.has(ref.fileId)) {
      sources.set(ref.fileId, { fileId: ref.fileId, name: ref.source.name, webUrl: ref.source.webUrl, syncStatus: ref.source.syncStatus, relationType: ref.relationType, sheetOrSection: ref.sheetOrSection, quoteOrCell: ref.quoteOrCell });
    }
  }
  const list = [...sources.values()];
  return {
    id: r.id,
    ...toFields(r),
    owners: r.owners.map((o) => ({ id: o.member.id, displayName: o.member.displayName })).sort((a, b) => a.id.localeCompare(b.id)),
    pendingSuggestions: r.suggestions.length,
    sources: list,
    hasStaleSource: list.some((s) => STALE.has(s.syncStatus)),
    origin: r.origin,
    updatedAt: r.updatedAt,
  };
}

function matches(a: ActivityListItem, f: ActivityFilter, today: string): boolean {
  if (f.ownerId && !a.ownerIds.includes(f.ownerId)) return false;
  if (f.front && a.front !== f.front) return false;
  const status = f.status ?? 'open';
  if (status === 'open' && a.status === 'done') return false;
  if (status !== 'open' && status !== 'all' && a.status !== status) return false;
  const due = f.due ?? 'all';
  if (due === 'none' && a.dueDate) return false;
  if (due === 'overdue' && !(a.dueDate && a.dueDate < today && a.status !== 'done')) return false;
  if (due === 'week' && !(a.dueDate && a.dueDate <= addDays(today, 7))) return false;
  return true;
}

export async function listActivities(filter: ActivityFilter, today: string): Promise<ActivityListItem[]> {
  const rows = await fetchRows();
  return rows
    .map(toListItem)
    .filter((a) => matches(a, filter, today))
    .sort((a, b) => {
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return a.id.localeCompare(b.id);
    });
}

export async function getActivityDetail(id: string): Promise<ActivityDetail | null> {
  const [row] = await fetchRows({ id });
  if (!row) return null;
  const members = await loadMembers();
  const events = await prisma.activityEvent.findMany({ where: { activityId: id }, orderBy: [{ timestamp: 'desc' }, { id: 'desc' }] });
  const sourceIds = [...new Set(events.map((e) => e.sourceFileId).filter((x): x is string => Boolean(x)))];
  const sources = await prisma.source.findMany({ where: { fileId: { in: sourceIds } } });
  return {
    ...toListItem(row),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    events: events.map((e) => {
      const keys = parseJson<(keyof ActivityFields)[]>(e.changedFields, []);
      const src = sources.find((s) => s.fileId === e.sourceFileId);
      const changes =
        e.type === 'import' || e.type === 'create'
          ? ['Atividade registrada']
          : describeChanges(parseJson<ActivityPatch>(e.before, {}), parseJson<ActivityPatch>(e.after, {}), keys, members);
      return {
        id: e.id,
        actorName: e.actorId === 'system' ? 'Sistema (importação)' : members.find((m) => m.id === e.actorId)?.displayName ?? e.actorId,
        timestamp: e.timestamp,
        type: e.type,
        changes,
        reason: e.reason,
        source: src ? { name: src.name, webUrl: src.webUrl, syncStatus: src.syncStatus } : null,
      };
    }),
    pending: row.suggestions.map((s) => ({ id: s.id, kind: s.kind, proposedFields: parseJson<ActivityPatch>(s.proposedFields, {}), evidence: s.evidence, sourceName: s.source.name, sourceUrl: s.source.webUrl })),
  };
}

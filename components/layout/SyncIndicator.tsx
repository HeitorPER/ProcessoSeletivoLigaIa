import Link from 'next/link';
import { prisma } from '@/lib/db';
import { getGoogleConnection } from '@/lib/google/oauth';
import { describeSyncState } from '@/lib/sync/describe';

const TONE = { ok: 'bg-white/15 text-white', warn: 'bg-warn-soft text-warn', error: 'bg-danger-soft text-danger' };
const ICON = { ok: '●', warn: '▲', error: '✕' };

export async function SyncIndicator() {
  const [state, conn] = await Promise.all([prisma.syncState.findUnique({ where: { id: 1 } }), getGoogleConnection()]);
  const d = describeSyncState({ state, connected: conn.connected, now: new Date() });
  return (
    <Link href="/sincronizacao" className={`inline-flex items-center gap-2 rounded px-2 py-1 text-sm font-medium ${TONE[d.tone]}`} title={d.detail ?? undefined}>
      <span aria-hidden="true">{ICON[d.tone]}</span>
      {d.label}
    </Link>
  );
}

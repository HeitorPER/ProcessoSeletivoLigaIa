import type { AuthorityState } from '@/lib/authority/classify';
import { prisma } from '@/lib/db';
import { parseJson } from '@/lib/json';
import type { SourceMeta, SourceMetaJson } from '@/lib/types';

export async function getSyncState() {
  return (await prisma.syncState.findUnique({ where: { id: 1 } })) ?? prisma.syncState.create({ data: { id: 1 } });
}

export async function upsertSourceMeta(meta: SourceMeta): Promise<void> {
  const data = {
    name: meta.name, mimeType: meta.mimeType, webUrl: meta.webUrl, modifiedAt: meta.modifiedAt,
    versionOrHash: meta.versionOrHash, path: meta.path, parentIds: JSON.stringify(meta.parentIds),
  };
  await prisma.source.upsert({ where: { fileId: meta.fileId }, update: data, create: { fileId: meta.fileId, ...data } });
}

export async function mergeSourceMeta(fileId: string, patch: Partial<SourceMetaJson>): Promise<void> {
  const row = await prisma.source.findUnique({ where: { fileId } });
  if (!row) return;
  await prisma.source.update({ where: { fileId }, data: { meta: JSON.stringify({ ...parseJson<SourceMetaJson>(row.meta, {}), ...patch }) } });
}

/** Marca a fonte como indisponível e apaga o texto em cache. Devolve true se o estado mudou. */
export async function markSourceUnavailable(fileId: string, reason: string): Promise<boolean> {
  const r = await prisma.source.updateMany({
    where: { fileId, NOT: { syncStatus: 'unavailable' } },
    data: { syncStatus: 'unavailable', statusReason: reason, extractedText: null },
  });
  return r.count > 0;
}

export async function loadAuthority(): Promise<AuthorityState> {
  const state = await getSyncState();
  let config: AuthorityState['config'] = null;
  if (state.authorityIndexFileId) {
    const index = await prisma.source.findUnique({ where: { fileId: state.authorityIndexFileId } });
    config = parseJson<SourceMetaJson>(index?.meta, {}).authority ?? null;
  }
  return { config, registryFileId: state.authorityFileId };
}

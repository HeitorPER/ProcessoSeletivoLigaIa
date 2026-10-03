import type { AIProvider } from '@/lib/ai/types';
import { validateItems } from '@/lib/ai/validate';
import { sameFileName } from '@/lib/authority/classify';
import { listActivitySnapshots } from '@/lib/activities/service';
import { prisma } from '@/lib/db';
import { parseJson } from '@/lib/json';
import { loadMembers } from '@/lib/members';
import type { MarkdownDoc, SourceMeta, SourceMetaJson } from '@/lib/types';
import { getSyncState, loadAuthority } from './sources';
import { saveDiscarded, saveSuggestion, supersedePending } from './suggestions';

async function registryOrigins(): Promise<Record<string, string>> {
  const state = await getSyncState();
  if (!state.authorityFileId) return {};
  const reg = await prisma.source.findUnique({ where: { fileId: state.authorityFileId } });
  return parseJson<SourceMetaJson>(reg?.meta, {}).registryOrigins ?? {};
}

export async function processMinutes(meta: SourceMeta, doc: MarkdownDoc, meetingDate: string | null, provider: AIProvider, firstTime: boolean): Promise<{ created: number; note: string | null }> {
  // Sem a importação inicial da planilha não dá para saber quais atas já foram consolidadas nela: tenta de novo depois.
  const state = await getSyncState();
  if ((await loadAuthority()).config?.registryFileName && !state.initialImportAt) {
    throw new Error('Aguardando a importação inicial da planilha de atividades');
  }

  // Ata citada como "Origem" no registro inicial já foi consolidada na planilha: só liga as referências.
  // Só conta atividade importada (origin = import); linhas criadas depois por sugestão não dispensam a análise.
  const originIds = Object.entries(await registryOrigins()).filter(([, origin]) => sameFileName(origin, meta.name)).map(([id]) => id);
  const originOf = (await prisma.activity.findMany({ where: { id: { in: originIds }, origin: 'import' }, select: { id: true } })).map((a) => a.id);
  if (firstTime && originOf.length > 0) {
    for (const activityId of originOf) {
      const exists = await prisma.reference.findFirst({ where: { activityId, fileId: meta.fileId, relationType: 'created_by' } });
      if (!exists) await prisma.reference.create({ data: { activityId, fileId: meta.fileId, versionOrHash: meta.versionOrHash, relationType: 'created_by' } });
    }
    return { created: 0, note: 'Ata de origem do registro inicial (já consolidada na planilha) — sem novas sugestões' };
  }

  const [activities, members] = await Promise.all([listActivitySnapshots(), loadMembers()]);
  const items = await provider.extract({ documentName: meta.name, meetingDate, text: doc.text, activities, members });
  const result = validateItems(items, { text: doc.text, sections: doc.sections, activities, members });
  // Só substitui as sugestões da versão antiga depois que a nova análise deu certo.
  await supersedePending(meta.fileId, meta.versionOrHash);
  let created = 0;
  for (const s of result.suggestions) if (await saveSuggestion(s, meta)) created++;
  await saveDiscarded(meta.fileId, meta.versionOrHash, result.discarded);
  if (result.dropped.length) {
    console.info(`[ingestão] ${meta.name}: ${result.dropped.length} item(ns) descartado(s) na validação: ${result.dropped.map((d) => d.reason).join(' | ')}`);
  }
  return { created, note: null };
}

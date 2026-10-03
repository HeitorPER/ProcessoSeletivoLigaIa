import { FIELD_KEYS, pickFields, sameFieldValue } from '@/lib/activity-fields';
import { isActivitySheet } from '@/lib/authority/classify';
import { getActivitySnapshot } from '@/lib/activities/service';
import { prisma } from '@/lib/db';
import { storedTextToDoc } from '@/lib/extract';
import { loadMembers } from '@/lib/members';
import type { SourceMeta, SpreadsheetDoc } from '@/lib/types';
import { cellEvidence, parseRegistryRows } from './registry';
import { saveSuggestion } from './suggestions';

export async function registerSourceConflict(meta: SourceMeta, doc: SpreadsheetDoc, reason: string): Promise<number> {
  const rowCount = doc.sheets.filter(isActivitySheet).reduce((n, s) => n + s.rows.length, 0);
  const uncertainties =
    rowCount === 0
      ? ['A planilha está vazia: tratá-la como fonte apagaria todas as atividades oficiais']
      : [`A planilha tem ${rowCount} linha(s) de atividade que podem divergir do registro oficial`];
  const evidence = `Planilha "${meta.name}" — aba(s): ${doc.sheets.map((s) => s.name).join(', ')}; ${rowCount} linha(s) de atividade`;
  // Um conflito por arquivo: só substitui o pendente se o conteúdo mudou.
  const older = await prisma.suggestion.findMany({ where: { sourceFileId: meta.fileId, kind: 'source_conflict', reviewStatus: 'pending', NOT: { evidence } } });
  if (older.length > 0) {
    await prisma.suggestion.updateMany({
      where: { id: { in: older.map((s) => s.id) } },
      data: { reviewStatus: 'superseded', reviewedAt: new Date(), reviewNote: 'Planilha foi editada; conflito substituído pela análise da nova versão' },
    });
  }
  const ok = await saveSuggestion(
    {
      kind: 'source_conflict', targetActivityId: null, proposedFields: {},
      evidence,
      evidenceLocator: meta.path ? `${meta.path}/${meta.name}` : meta.name,
      reason: `${reason}. Nenhuma atividade foi alterada. Aceitar = analisar as linhas como sugestões; rejeitar = descartar a planilha.`,
      uncertainties, front: null,
    },
    meta,
    { versionless: true },
  );
  return ok ? 1 : 0;
}

/** Chamado quando um revisor aceita um conflito de fonte: cada linha vira sugestão comum, nunca alteração direta. */
export async function analyzeUnauthorizedSheet(fileId: string): Promise<number> {
  const source = await prisma.source.findUnique({ where: { fileId } });
  if (!source?.extractedText) return 0;
  const doc = storedTextToDoc(source.extractedText);
  if (doc.kind !== 'spreadsheet') return 0;
  const members = await loadMembers();
  const ref = { fileId, versionOrHash: source.versionOrHash };
  const extra = 'Fonte sem autoridade definida pelo INDEX.md — confira antes de aceitar';
  let created = 0;
  for (const sheet of doc.sheets.filter(isActivitySheet)) {
    for (const row of parseRegistryRows(sheet, members).rows) {
      const locator = `${source.name}, aba ${sheet.name}, linha ${row.rowNumber}`;
      const official = await getActivitySnapshot(row.id);
      if (!official) {
        const ok = await saveSuggestion(
          { kind: 'create', targetActivityId: null, proposedId: row.id, proposedFields: row.fields, evidence: `${sheet.name}!${row.cellRefs.id ?? `A${row.rowNumber}`}: ${row.id} — ${row.fields.title}`, evidenceLocator: locator, reason: `Linha da planilha "${source.name}", analisada a pedido de um revisor`, uncertainties: [...row.issues, extra], front: row.fields.front },
          ref,
        );
        if (ok) created++;
        continue;
      }
      const keys = FIELD_KEYS.filter((k) => !sameFieldValue(k, row.fields[k], official[k]));
      if (keys.length === 0) continue;
      const ok = await saveSuggestion(
        { kind: 'update', targetActivityId: row.id, proposedFields: pickFields(row.fields, keys), evidence: cellEvidence(sheet.name, row, keys, members), evidenceLocator: locator, reason: `Diferença encontrada na planilha "${source.name}", analisada a pedido de um revisor`, uncertainties: [...row.issues, extra], front: official.front },
        ref,
      );
      if (ok) created++;
    }
  }
  return created;
}

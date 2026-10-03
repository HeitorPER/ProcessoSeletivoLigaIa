import { FIELD_KEYS, fieldsEqualStrict, pickFields, sameFieldValue } from '@/lib/activity-fields';
import { formatFieldValue } from '@/lib/activities/format';
import { createActivity, getActivitySnapshot } from '@/lib/activities/service';
import { isIsoDate } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { loadMembers } from '@/lib/members';
import { normalizeName } from '@/lib/text';
import { FRONTS, type ActivityFields, type ActivityStatus, type CellValue, type MemberInfo, type ProposedSuggestion, type Sheet, type SourceMeta, type SourceMetaJson, type SpreadsheetDoc } from '@/lib/types';
import { getSyncState } from './sources';
import { saveDiscarded, saveSuggestion, supersedePendingForTarget } from './suggestions';

const COLUMN_ALIASES: Record<string, string[]> = {
  id: ['id'],
  title: ['atividade', 'titulo'],
  owners: ['responsaveis', 'responsavel'],
  dueDate: ['prazo'],
  front: ['frente'],
  priority: ['prioridade'],
  status: ['status', 'estado'],
  nextStep: ['proximo passo'],
  origin: ['origem'],
  notes: ['notas e bloqueios', 'notas', 'observacoes'],
  description: ['descricao'],
};
const FIELD_TO_COLUMN: Record<keyof ActivityFields, string> = {
  title: 'title', description: 'description', nextStep: 'nextStep', front: 'front', status: 'status',
  dueDate: 'dueDate', priority: 'priority', notes: 'notes', blockedReason: 'notes', ownerIds: 'owners',
};
const STATUS_MAP: Record<string, ActivityStatus> = {
  'a fazer': 'todo', pendente: 'todo', 'em andamento': 'in_progress', andamento: 'in_progress',
  bloqueada: 'blocked', bloqueado: 'blocked', concluida: 'done', concluido: 'done', feito: 'done',
};

export interface RegistryRow {
  rowNumber: number;
  id: string;
  fields: ActivityFields;
  origin: string | null;
  cellRefs: Record<string, string>; // chave = coluna lógica (id, title, owners, dueDate...)
  issues: string[];
  /** Campos cuja célula não foi interpretada: nunca viram proposta (evita limpar valores oficiais por erro de leitura). */
  unparsed: (keyof ActivityFields)[];
}

const text = (v: CellValue): string | null => {
  if (v === null) return null;
  const s = String(v).trim();
  return s || null;
};

function parseDue(v: CellValue): { value: string | null; issue?: string } {
  const s = text(v);
  if (!s) return { value: null };
  if (isIsoDate(s)) return { value: s };
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (br) {
    const iso = `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
    if (isIsoDate(iso)) return { value: iso };
  }
  return { value: null, issue: `prazo "${s}" não reconhecido — ficou "a definir"` };
}

export function parseRegistryRows(sheet: Sheet, members: MemberInfo[]): { rows: RegistryRow[]; issues: string[] } {
  const header: Record<string, string | undefined> = {};
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) header[key] = sheet.headers.find((h) => aliases.includes(normalizeName(h)));
  const rows: RegistryRow[] = [];
  const issues: string[] = [];

  for (const r of sheet.rows) {
    const get = (k: string): CellValue => (header[k] ? r.cells[header[k]!] ?? null : null);
    const rawId = text(get('id'));
    if (!rawId || !/^ACT-[\w-]+$/i.test(rawId)) {
      issues.push(`${sheet.name}, linha ${r.rowNumber}: sem ID ACT-* válido — linha ignorada`);
      continue;
    }
    const id = rawId.toUpperCase();
    const rowIssues: string[] = [];
    const unparsed = new Set<keyof ActivityFields>();

    const ownerIds: string[] = [];
    for (const name of (text(get('owners')) ?? '').split(/;|,|\s+e\s+/).map((s) => s.trim()).filter(Boolean)) {
      const m = members.find((x) => normalizeName(x.displayName) === normalizeName(name));
      if (m) ownerIds.push(m.id);
      else {
        rowIssues.push(`${id}: responsável "${name}" não reconhecido — a confirmar`);
        unparsed.add('ownerIds');
      }
    }
    const statusText = text(get('status'));
    let status: ActivityStatus = 'todo';
    if (statusText) {
      const mapped = STATUS_MAP[normalizeName(statusText)];
      if (mapped) status = mapped;
      else {
        rowIssues.push(`${id}: estado "${statusText}" não reconhecido — considerado "A fazer"`);
        unparsed.add('status');
        unparsed.add('blockedReason');
      }
    }
    const due = parseDue(get('dueDate'));
    if (due.issue) {
      rowIssues.push(`${id}: ${due.issue}`);
      unparsed.add('dueDate');
    }
    const frontText = text(get('front'));
    const front = frontText ? FRONTS.find((f) => normalizeName(f) === normalizeName(frontText)) ?? null : null;
    if (frontText && !front) {
      rowIssues.push(`${id}: frente "${frontText}" não reconhecida`);
      unparsed.add('front');
    }
    const notes = text(get('notes'));

    const cellRefs: Record<string, string> = {};
    for (const [key, h] of Object.entries(header)) if (h && r.cellRefs[h]) cellRefs[key] = r.cellRefs[h];

    rows.push({
      rowNumber: r.rowNumber,
      id,
      origin: text(get('origin')),
      cellRefs,
      issues: rowIssues,
      unparsed: [...unparsed],
      fields: {
        title: text(get('title')) ?? id,
        description: text(get('description')),
        nextStep: text(get('nextStep')),
        front,
        status,
        dueDate: due.value,
        priority: text(get('priority')),
        notes,
        blockedReason: status === 'blocked' ? notes : null,
        ownerIds: ownerIds.sort(),
      },
    });
    issues.push(...rowIssues);
  }
  return { rows, issues };
}

export function cellEvidence(sheetName: string, row: RegistryRow, keys: (keyof ActivityFields)[], members: MemberInfo[]): string {
  return keys
    .map((k) => `${sheetName}!${row.cellRefs[FIELD_TO_COLUMN[k]] ?? `linha ${row.rowNumber}`} = ${formatFieldValue(k, row.fields[k], members)}`)
    .join('; ');
}

const SUPERSEDE_NOTE = 'Planilha vigente foi editada novamente; sugestão substituída pela versão mais recente';

/**
 * `baseline` = linhas da importação inicial (nunca atualizada). Uma linha só vira proposta onde difere do baseline
 * e do oficial; assim edições sucessivas da planilha não acumulam sugestões e voltar ao valor oficial limpa a pendência.
 */
async function diffRegistry(meta: SourceMeta, sheetName: string, rows: RegistryRow[], baseline: Record<string, ActivityFields>, members: MemberInfo[]): Promise<number> {
  let created = 0;
  for (const row of rows) {
    const before = baseline[row.id];
    const official = await getActivitySnapshot(row.id);
    if (!before && !official) {
      const proposal: ProposedSuggestion = {
        kind: 'create', targetActivityId: null, proposedId: row.id, proposedFields: row.fields,
        evidence: `${sheetName}!${row.cellRefs.id ?? `A${row.rowNumber}`}: ${row.id} — ${row.fields.title}`,
        evidenceLocator: `${sheetName}, linha ${row.rowNumber}`,
        reason: 'Nova linha na planilha vigente depois da importação inicial', uncertainties: row.issues, front: row.fields.front,
      };
      await supersedePendingForTarget(meta.fileId, 'create', row.id, proposal.proposedFields as Record<string, unknown>, SUPERSEDE_NOTE);
      if (await saveSuggestion(proposal, meta, { versionless: true })) created++;
      continue;
    }
    if (!before || !official) continue;
    const keys = FIELD_KEYS.filter(
      (k) => !row.unparsed.includes(k) && !fieldsEqualStrict(k, before[k], row.fields[k]) && !sameFieldValue(k, row.fields[k], official[k]),
    );
    if (keys.length === 0) {
      await supersedePendingForTarget(meta.fileId, 'update', row.id, null, SUPERSEDE_NOTE);
      continue;
    }
    const proposedFields = pickFields(row.fields, keys);
    await supersedePendingForTarget(meta.fileId, 'update', row.id, proposedFields as Record<string, unknown>, SUPERSEDE_NOTE);
    const ok = await saveSuggestion(
      {
        kind: 'update', targetActivityId: row.id, proposedFields,
        evidence: cellEvidence(sheetName, row, keys, members), evidenceLocator: `${sheetName}, linha ${row.rowNumber}`,
        reason: 'A planilha vigente foi editada no Drive depois da importação', uncertainties: row.issues, front: official.front,
      },
      meta,
      { versionless: true },
    );
    if (ok) created++;
  }
  const removed = Object.keys(baseline).filter((id) => !rows.some((r) => r.id === id));
  await saveDiscarded(
    meta.fileId,
    meta.versionOrHash,
    removed.map((id) => ({ excerpt: `${id} — ${baseline[id].title}`, reason: 'Linha removida da planilha vigente; a atividade oficial foi mantida (remover exige decisão na aplicação)' })),
  );
  return created;
}

export async function handleRegistry(meta: SourceMeta, doc: SpreadsheetDoc, sheetName: string, metaJson: SourceMetaJson): Promise<number> {
  const sheet = doc.sheets.find((s) => s.name === sheetName);
  if (!sheet) throw new Error(`Aba ${sheetName} não encontrada`);
  const members = await loadMembers();
  const { rows, issues } = parseRegistryRows(sheet, members);
  const state = await getSyncState();
  let created = 0;

  if (!state.initialImportAt) {
    for (const row of rows) {
      if (await prisma.activity.findUnique({ where: { id: row.id } })) continue;
      await createActivity(row.fields, 'system', {
        id: row.id, origin: 'import', sourceFileId: meta.fileId,
        reason: `Importação inicial: ${meta.name}, aba ${sheetName}, linha ${row.rowNumber}`,
        reference: { versionOrHash: meta.versionOrHash, sheetOrSection: `${sheetName}, linha ${row.rowNumber}`, quoteOrCell: `${sheetName}!${row.cellRefs.id ?? `A${row.rowNumber}`}` },
      });
    }
    await prisma.syncState.update({ where: { id: 1 }, data: { initialImportAt: new Date(), authorityFileId: meta.fileId, authoritySheet: sheetName } });
    // Baseline da importação inicial: nunca é atualizada pelas versões seguintes.
    metaJson.registryRows = Object.fromEntries(rows.map((r) => [r.id, r.fields]));
    metaJson.registryOrigins = Object.fromEntries(rows.filter((r) => r.origin).map((r) => [r.id, r.origin!]));
  } else {
    created = await diffRegistry(meta, sheetName, rows, metaJson.registryRows ?? {}, members);
  }

  await saveDiscarded(meta.fileId, meta.versionOrHash, issues.map((i) => ({ excerpt: i, reason: 'Dado incompleto ou não reconhecido na planilha vigente' })));
  metaJson.registrySheet = sheetName;
  return created;
}

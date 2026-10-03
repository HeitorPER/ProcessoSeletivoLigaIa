import type { AuthorityConfig, ExtractedDoc, MarkdownDoc, Sheet, SourceKind } from '@/lib/types';
import { isIsoDate } from '@/lib/dates';
import { normalizeName } from '@/lib/text';

export interface AuthorityState {
  config: AuthorityConfig | null;
  registryFileId: string | null;
}
export interface ClassifyInput {
  fileId: string;
  name: string;
  mimeType: string;
  doc: ExtractedDoc;
}
export interface Classification {
  kind: SourceKind;
  reason: string;
  meetingDate: string | null;
  registrySheet?: string;
}

const DIRECTION_NAMES = new Set(['estado-atual', 'estado_atual', 'estado atual', 'guia_inicial', 'guia-inicial', 'guia inicial']);

export function baseFileName(name: string): string {
  return normalizeName(name).replace(/\.(md|markdown|txt|xlsx|xls|pdf|docx)$/, '');
}
export function sameFileName(a: string, b: string): boolean {
  return baseFileName(a) === baseFileName(b);
}
export function isIndexFile(name: string): boolean {
  return baseFileName(name) === 'index';
}
export function isActivitySheet(sheet: Sheet): boolean {
  const h = sheet.headers.map(normalizeName);
  return h.includes('id') && (h.includes('atividade') || h.includes('titulo')) && h.some((x) => x.startsWith('responsave'));
}
export function meetingDateOf(name: string, doc: MarkdownDoc): string | null {
  const fm = doc.frontMatter.data_da_reuniao?.trim();
  if (fm && isIsoDate(fm)) return fm;
  const fromName = /(\d{4}-\d{2}-\d{2})/.exec(name)?.[1];
  return fromName && isIsoDate(fromName) ? fromName : null;
}

function classifyMarkdown(input: ClassifyInput, doc: MarkdownDoc, authority: AuthorityState): Classification {
  const fm = doc.frontMatter;
  const meetingDate = meetingDateOf(input.name, doc);
  if (isIndexFile(input.name)) return { kind: 'direction', reason: 'Índice do acervo: define a fonte vigente das atividades', meetingDate: null };

  const supersededByIndex = authority.config?.supersededFileNames.some((f) => sameFileName(f, input.name)) ?? false;
  if (fm.status?.toLowerCase() === 'deprecated' || supersededByIndex) {
    return {
      kind: 'deprecated',
      reason: fm.substituido_por ? `Histórico — substituído por ${fm.substituido_por}` : 'Histórico — marcado como superado no INDEX.md',
      meetingDate,
    };
  }

  const base = baseFileName(input.name);
  const looksLikeMinutes =
    Boolean(fm.data_da_reuniao) ||
    /(^|[\s_-])(ata|reuniao)([\s_-]|$)/.test(base) ||
    /^#\s.*\b(ata|reuni[aã]o)\b/im.test(doc.text.slice(0, 400));
  if (looksLikeMinutes) return { kind: 'minutes', reason: 'Ata de reunião: analisada para sugerir atividades', meetingDate };

  if (DIRECTION_NAMES.has(base)) return { kind: 'direction', reason: 'Documento de direção usado em "Comece aqui"', meetingDate: null };
  return { kind: 'other', reason: 'Documento indexado; não é ata nem registro de atividades', meetingDate: null };
}

function classifySpreadsheet(input: ClassifyInput, sheets: Sheet[], authority: AuthorityState): Classification {
  const cfg = authority.config;
  const activitySheets = sheets.filter(isActivitySheet);

  if (!cfg?.registryFileName) {
    return activitySheets.length
      ? { kind: 'other', reason: 'Planilha de atividades aguardando o INDEX.md indicar a fonte vigente', meetingDate: null }
      : { kind: 'other', reason: 'Planilha sem relação com o registro de atividades', meetingDate: null };
  }

  if (sameFileName(cfg.registryFileName, input.name)) {
    if (authority.registryFileId && authority.registryFileId !== input.fileId) {
      return { kind: 'unauthorized_sheet', reason: `Outro arquivo com o mesmo nome da fonte vigente (${cfg.registryFileName}); a fonte já importada é mantida`, meetingDate: null };
    }
    const sheet = cfg.registrySheet
      ? sheets.find((s) => normalizeName(s.name) === normalizeName(cfg.registrySheet!))
      : activitySheets[0];
    if (!sheet) {
      return { kind: 'unauthorized_sheet', reason: `A aba "${cfg.registrySheet ?? 'de atividades'}" indicada no INDEX.md não foi encontrada em ${input.name}`, meetingDate: null };
    }
    return { kind: 'activity_registry', reason: `Fonte vigente das atividades (INDEX.md: ${cfg.registryFileName}, aba ${sheet.name})`, meetingDate: null, registrySheet: sheet.name };
  }

  if (activitySheets.length) {
    const where = `${cfg.registryFileName}${cfg.registrySheet ? `, aba ${cfg.registrySheet}` : ''}`;
    return { kind: 'unauthorized_sheet', reason: `Planilha com formato de atividades que não é a fonte indicada no INDEX.md (${where})`, meetingDate: null };
  }
  return { kind: 'other', reason: 'Planilha sem relação com o registro de atividades', meetingDate: null };
}

export function classify(input: ClassifyInput, authority: AuthorityState): Classification {
  return input.doc.kind === 'markdown'
    ? classifyMarkdown(input, input.doc, authority)
    : classifySpreadsheet(input, input.doc.sheets, authority);
}

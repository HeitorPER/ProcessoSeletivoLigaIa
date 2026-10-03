export const FRONTS = ['Growth', 'Formação', 'Operações'] as const;
export type Front = (typeof FRONTS)[number];

export const ACTIVITY_STATUSES = ['todo', 'in_progress', 'blocked', 'done'] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];
export const STATUS_LABELS: Record<ActivityStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  blocked: 'Bloqueada',
  done: 'Concluída',
};

export type SourceKind =
  | 'activity_registry'
  | 'minutes'
  | 'direction'
  | 'deprecated'
  | 'unauthorized_sheet'
  | 'unsupported'
  | 'other';
export const SOURCE_KIND_LABELS: Record<SourceKind, string> = {
  activity_registry: 'Fonte vigente de atividades',
  minutes: 'Ata',
  direction: 'Documento de direção',
  deprecated: 'Histórico — superado',
  unauthorized_sheet: 'Planilha sem autoridade',
  unsupported: 'Formato não processado',
  other: 'Outro documento',
};

export type SyncStatus = 'processed' | 'ignored' | 'error' | 'unavailable' | 'stale';
export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  processed: 'Processado',
  ignored: 'Ignorado',
  error: 'Com erro',
  unavailable: 'Indisponível',
  stale: 'Desatualizado',
};

export type ReviewStatus = 'pending' | 'accepted' | 'adjusted' | 'rejected' | 'superseded';
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'Pendente',
  accepted: 'Aceita',
  adjusted: 'Ajustada',
  rejected: 'Rejeitada',
  superseded: 'Substituída',
};

export type SuggestionKind = 'create' | 'update' | 'source_conflict';

export interface Section {
  heading: string;
  level: number;
  text: string;
  startLine: number;
}

export interface MarkdownDoc {
  kind: 'markdown';
  text: string;
  frontMatter: Record<string, string>;
  sections: Section[];
}

export type CellValue = string | number | boolean | null;

export interface SheetRow {
  rowNumber: number; // número da linha na planilha (1 = cabeçalho)
  cells: Record<string, CellValue>; // chave = texto do cabeçalho
  cellRefs: Record<string, string>; // chave = texto do cabeçalho, valor = "D2"
}

export interface Sheet {
  name: string;
  headers: string[];
  rows: SheetRow[];
}

export interface SpreadsheetDoc {
  kind: 'spreadsheet';
  sheets: Sheet[];
}

export type ExtractedDoc = MarkdownDoc | SpreadsheetDoc;

export type FetchedContent =
  | { format: 'markdown'; text: string }
  | { format: 'xlsx'; buffer: Buffer }
  | { format: 'pdf'; buffer: Buffer }
  | { format: 'unsupported'; reason: string };

export interface ActivityFields {
  title: string;
  description: string | null;
  nextStep: string | null;
  front: string | null;
  status: ActivityStatus;
  dueDate: string | null; // AAAA-MM-DD
  priority: string | null;
  notes: string | null;
  blockedReason: string | null;
  ownerIds: string[];
}
export type ActivityPatch = Partial<ActivityFields>;
export interface ActivitySnapshot extends ActivityFields {
  id: string;
}

export interface ProposedSuggestion {
  kind: SuggestionKind;
  targetActivityId: string | null;
  proposedId?: string | null;
  proposedFields: ActivityPatch;
  evidence: string;
  evidenceLocator: string | null;
  reason: string;
  uncertainties: string[];
  front: string | null;
}

export interface DiscardedExcerpt {
  excerpt: string;
  reason: string;
}

export interface MemberInfo {
  id: string;
  displayName: string;
  front: string;
  role: 'member' | 'reviewer';
  reviewFronts: string[];
}

export interface SourceMeta {
  fileId: string;
  name: string;
  mimeType: string;
  webUrl: string;
  modifiedAt: Date;
  versionOrHash: string;
  path: string;
  parentIds: string[];
}

export interface AuthorityConfig {
  registryFileName: string | null;
  registrySheet: string | null;
  supersededFileNames: string[];
}

/** Conteúdo do campo JSON `Source.meta`. */
export interface SourceMetaJson {
  frontMatter?: Record<string, string>;
  meetingDate?: string | null;
  authority?: AuthorityConfig;
  registrySheet?: string;
  registryRows?: Record<string, ActivityFields>;
  registryOrigins?: Record<string, string>; // activityId -> nome do arquivo de origem
  driveRevision?: string; // md5/version/modifiedTime do Drive na última leitura bem-sucedida
}

import { listActivities } from '@/lib/activities/queries';
import { baseFileName } from '@/lib/authority/classify';
import { prisma } from '@/lib/db';
import { parseMarkdown, stripFrontMatterLines } from '@/lib/extract/markdown';
import { SOURCE_KIND_LABELS, SYNC_STATUS_LABELS, type ActivityStatus, type SourceKind, type SyncStatus } from '@/lib/types';

export interface DocLink {
  fileId: string;
  name: string;
  webUrl: string;
  kindLabel: string;
  statusLabel: string;
  available: boolean;
}
export interface OnboardingData {
  purpose: { text: string | null; provisional: boolean; confirmBy: string | null; source: DocLink | null };
  fronts: { text: string | null; source: DocLink | null };
  howWeWork: { text: string | null; source: DocLink | null; history: DocLink[] };
  activitySource: { registry: DocLink | null; sheet: string | null; importedAt: Date | null };
  firstAction: { id: string; title: string; dueDate: string | null; nextStep: string | null; status: ActivityStatus } | null;
  documents: DocLink[];
  gaps: string[];
}

type SourceRow = Awaited<ReturnType<typeof prisma.source.findMany>>[number];

function toLink(s: SourceRow): DocLink {
  return {
    fileId: s.fileId, name: s.name, webUrl: s.webUrl,
    kindLabel: SOURCE_KIND_LABELS[s.kind as SourceKind] ?? s.kind,
    statusLabel: SYNC_STATUS_LABELS[s.syncStatus as SyncStatus] ?? s.syncStatus,
    available: s.syncStatus !== 'unavailable',
  };
}

function sectionText(text: string, heading: RegExp): string | null {
  return parseMarkdown(text).sections.find((s) => heading.test(s.heading))?.text ?? null;
}

export async function getOnboarding(memberId: string, today: string): Promise<OnboardingData> {
  const sources = await prisma.source.findMany({ orderBy: { name: 'asc' } });
  const state = await prisma.syncState.findUnique({ where: { id: 1 } });
  const find = (...names: string[]) => sources.find((s) => names.includes(baseFileName(s.name)));
  const estado = find('estado-atual', 'estado_atual', 'estado atual');
  const guia = find('guia_inicial', 'guia-inicial', 'guia inicial');
  const gaps: string[] = [];

  let purpose: OnboardingData['purpose'] = { text: null, provisional: true, confirmBy: null, source: estado ? toLink(estado) : null };
  if (!estado) gaps.push('Propósito: o documento ESTADO-ATUAL ainda não foi sincronizado');
  else if (!estado.extractedText) gaps.push(`Propósito: ${estado.name} está indisponível no momento`);
  else {
    const doc = parseMarkdown(estado.extractedText);
    const body = parseMarkdown(stripFrontMatterLines(estado.extractedText)).sections.find((s) => s.level === 1)?.text ?? null;
    const provisional = doc.frontMatter.status?.toLowerCase() !== 'ativo' || /provis[óo]ri/i.test(estado.extractedText);
    purpose = { text: body, provisional, confirmBy: doc.frontMatter.responsavel_por_confirmar ?? null, source: toLink(estado) };
    if (provisional) gaps.push(`Missão e propósito são provisórios — a confirmar${purpose.confirmBy ? ` por ${purpose.confirmBy}` : ''}`);
  }

  let fronts: OnboardingData['fronts'] = { text: null, source: guia ? toLink(guia) : null };
  let howText: string | null = null;
  if (!guia) gaps.push('Frentes e papéis: o documento GUIA_INICIAL ainda não foi sincronizado');
  else if (!guia.extractedText) gaps.push(`Frentes e papéis: ${guia.name} está indisponível no momento`);
  else {
    fronts = { text: sectionText(guia.extractedText, /frentes/i), source: toLink(guia) };
    howText = sectionText(guia.extractedText, /membro novo/i);
  }

  const registrySource = state?.authorityFileId ? sources.find((s) => s.fileId === state.authorityFileId) : undefined;
  if (!registrySource) gaps.push('Fonte de atividades ainda não importada (aguardando INDEX.md e a planilha indicada)');

  const [first] = await listActivities({ ownerId: memberId, status: 'open' }, today);
  if (!first) gaps.push('Você ainda não tem atividade atribuída — fale com a liderança da sua frente');

  const documents = sources.filter((s) => ['direction', 'activity_registry', 'deprecated'].includes(s.kind)).map(toLink);
  return {
    purpose,
    fronts,
    howWeWork: { text: howText, source: guia ? toLink(guia) : null, history: sources.filter((s) => s.kind === 'deprecated').map(toLink) },
    activitySource: { registry: registrySource ? toLink(registrySource) : null, sheet: state?.authoritySheet ?? null, importedAt: state?.initialImportAt ?? null },
    firstAction: first ? { id: first.id, title: first.title, dueDate: first.dueDate, nextStep: first.nextStep, status: first.status } : null,
    documents,
    gaps,
  };
}

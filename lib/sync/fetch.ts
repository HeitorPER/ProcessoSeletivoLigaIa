import { DriveError, GDOC_MIME, GSHEET_MIME, XLSX_MIME, type DriveApi, type DriveFileMeta } from '@/lib/drive/types';
import { normalizeGoogleDocMarkdown } from '@/lib/extract/markdown';
import type { FetchedContent } from '@/lib/types';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const TEXT_MIMES = new Set(['text/markdown', 'text/x-markdown', 'text/plain']);

export async function fetchContent(api: DriveApi, f: DriveFileMeta): Promise<FetchedContent> {
  const name = f.name.toLowerCase();
  if (f.mimeType === GDOC_MIME) {
    try {
      return { format: 'markdown', text: normalizeGoogleDocMarkdown((await api.exportFile(f.id, 'text/markdown')).toString('utf8')) };
    } catch (e) {
      if (e instanceof DriveError && e.reason === 'exportSizeLimitExceeded') {
        return { format: 'unsupported', reason: 'Documento maior que o limite de exportação do Google (10 MB) — não processado' };
      }
      if (e instanceof DriveError && e.status === 400) {
        return { format: 'markdown', text: (await api.exportFile(f.id, 'text/plain')).toString('utf8') };
      }
      throw e;
    }
  }
  if (f.mimeType === GSHEET_MIME) return { format: 'xlsx', buffer: await api.exportFile(f.id, XLSX_MIME) };
  if (f.mimeType.startsWith('application/vnd.google-apps.')) {
    return { format: 'unsupported', reason: `Tipo nativo do Google ainda não processado (${f.mimeType.replace('application/vnd.google-apps.', '')})` };
  }
  if (f.mimeType === DOCX_MIME || name.endsWith('.docx')) {
    return { format: 'unsupported', reason: 'Arquivo .docx não é lido diretamente — converta para Google Docs no Drive (Abrir com > Documentos Google)' };
  }
  if (!f.canDownload) return { format: 'unsupported', reason: 'Sem permissão de download para este arquivo' };
  if (f.mimeType === XLSX_MIME || name.endsWith('.xlsx')) return { format: 'xlsx', buffer: await api.download(f.id) };
  if (TEXT_MIMES.has(f.mimeType) || /\.(md|markdown|txt)$/.test(name)) return { format: 'markdown', text: (await api.download(f.id)).toString('utf8') };
  if (f.mimeType === 'application/pdf' || name.endsWith('.pdf')) return { format: 'pdf', buffer: await api.download(f.id) };
  return { format: 'unsupported', reason: `Formato ainda não processado (${f.mimeType})` };
}

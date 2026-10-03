import { google, type Auth, type drive_v3 } from 'googleapis';
import { withRetry } from './retry';
import { DriveError, type DriveApi, type DriveChange, type DriveFileMeta } from './types';

const FILE_FIELDS = 'id,name,mimeType,modifiedTime,md5Checksum,version,webViewLink,parents,trashed,capabilities(canDownload)';

export function toDriveFileMeta(f: drive_v3.Schema$File): DriveFileMeta {
  return {
    id: f.id ?? '',
    name: f.name ?? '(sem nome)',
    mimeType: f.mimeType ?? 'application/octet-stream',
    modifiedTime: f.modifiedTime ?? new Date(0).toISOString(),
    md5Checksum: f.md5Checksum ?? null,
    version: f.version ?? null,
    webViewLink: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
    parents: f.parents ?? [],
    trashed: Boolean(f.trashed),
    canDownload: f.capabilities?.canDownload ?? true,
  };
}

/** Converte erros do googleapis em DriveError com status e motivo; erros de rede seguem com seu `code`. */
function wrap(e: unknown): never {
  const err = e as { code?: number | string; status?: number; response?: { status?: number; data?: { error?: { errors?: { reason?: string }[]; message?: string } | string; error_description?: string } }; message?: string };
  const status = err.response?.status ?? err.status ?? (typeof err.code === 'number' ? err.code : 0);
  if (!status) throw e;
  const data = err.response?.data;
  const apiError = typeof data?.error === 'object' ? data.error : null;
  const reason = apiError?.errors?.[0]?.reason ?? (typeof data?.error === 'string' ? data.error : null);
  throw new DriveError(apiError?.message ?? data?.error_description ?? err.message ?? 'Erro na Drive API', status, reason);
}

const call = <T>(fn: () => Promise<T>) => withRetry(() => fn().catch(wrap));

export function createDriveApi(auth: Auth.OAuth2Client): DriveApi {
  const drive = google.drive({ version: 'v3', auth });
  return {
    async listChildren(folderId) {
      const out: DriveFileMeta[] = [];
      let pageToken: string | undefined;
      do {
        const res = await call(() =>
          drive.files.list({
            q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
            spaces: 'drive', pageSize: 1000, pageToken,
            fields: `nextPageToken,files(${FILE_FIELDS})`,
            supportsAllDrives: true, includeItemsFromAllDrives: true,
          }),
        );
        out.push(...(res.data.files ?? []).map(toDriveFileMeta));
        pageToken = res.data.nextPageToken ?? undefined;
      } while (pageToken);
      return out;
    },
    async getFile(id) {
      try {
        const res = await call(() => drive.files.get({ fileId: id, fields: FILE_FIELDS, supportsAllDrives: true }));
        return toDriveFileMeta(res.data);
      } catch (e) {
        if (e instanceof DriveError && e.status === 404) return null;
        throw e;
      }
    },
    async download(id) {
      const res = await call(() => drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' }));
      return Buffer.from(res.data as unknown as ArrayBuffer);
    },
    async exportFile(id, mimeType) {
      const res = await call(() => drive.files.export({ fileId: id, mimeType }, { responseType: 'arraybuffer' }));
      return Buffer.from(res.data as unknown as ArrayBuffer);
    },
    async getStartPageToken() {
      const res = await call(() => drive.changes.getStartPageToken({ supportsAllDrives: true }));
      if (!res.data.startPageToken) throw new DriveError('Drive não devolveu startPageToken', 500);
      return res.data.startPageToken;
    },
    async listChanges(pageToken) {
      const changes: DriveChange[] = [];
      let token: string | undefined = pageToken;
      let newStartPageToken = pageToken;
      while (token) {
        const current: string = token;
        const res = await call(() =>
          drive.changes.list({
            pageToken: current, pageSize: 1000, spaces: 'drive', includeRemoved: true,
            supportsAllDrives: true, includeItemsFromAllDrives: true,
            fields: `nextPageToken,newStartPageToken,changes(fileId,removed,file(${FILE_FIELDS}))`,
          }),
        );
        for (const c of res.data.changes ?? []) {
          changes.push({ fileId: c.fileId ?? c.file?.id ?? '', removed: Boolean(c.removed), file: c.file ? toDriveFileMeta(c.file) : null });
        }
        if (res.data.newStartPageToken) newStartPageToken = res.data.newStartPageToken;
        token = res.data.nextPageToken ?? undefined;
      }
      return { changes, newStartPageToken };
    },
  };
}

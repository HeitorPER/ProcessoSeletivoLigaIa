import { createHash } from 'node:crypto';
import type { DriveFileWithPath } from '@/lib/drive/tree';
import type { DriveFileMeta } from '@/lib/drive/types';
import type { FetchedContent, SourceMeta } from '@/lib/types';

/** Identifica a revisão no Drive (muda também em renomeações de arquivos nativos). */
export function driveRevision(f: DriveFileMeta): string {
  return f.md5Checksum ?? (f.version ? `v${f.version}` : f.modifiedTime);
}

/** Identifica o conteúdo: md5 para binários; sha256 do texto exportado para arquivos nativos. */
export function contentHash(f: DriveFileMeta, content: FetchedContent): string {
  if (f.md5Checksum) return f.md5Checksum;
  const h = createHash('sha256');
  if (content.format === 'markdown') h.update(content.text);
  else if (content.format === 'unsupported') h.update(`unsupported:${f.mimeType}:${f.modifiedTime}`);
  else h.update(content.buffer);
  return `sha256:${h.digest('hex').slice(0, 32)}`;
}

export function toSourceMeta(f: DriveFileWithPath, versionOrHash: string): SourceMeta {
  return { fileId: f.id, name: f.name, mimeType: f.mimeType, webUrl: f.webViewLink, modifiedAt: new Date(f.modifiedTime), versionOrHash, path: f.path, parentIds: f.parents };
}

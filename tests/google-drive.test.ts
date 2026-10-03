import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { decryptSecret, encryptSecret } from '@/lib/google/crypto';
import { buildAuthUrl, disconnectGoogle, getAuthorizedClient, getGoogleConnection, maskEmail, saveRefreshToken } from '@/lib/google/oauth';
import { toDriveFileMeta } from '@/lib/drive/client';
import { isRetryable, withRetry } from '@/lib/drive/retry';
import { isInsideTree, walkTree } from '@/lib/drive/tree';
import { DriveError, FOLDER_MIME, type DriveApi, type DriveFileMeta } from '@/lib/drive/types';
import { resetDb } from './helpers/db';

const meta = (id: string, name: string, parents: string[], mimeType = 'text/markdown'): DriveFileMeta => ({
  id, name, mimeType, parents, modifiedTime: '2026-10-03T10:00:00Z', md5Checksum: `md5-${id}`, version: '1', webViewLink: `https://drive/${id}`, trashed: false, canDownload: true,
});

function fakeApi(files: DriveFileMeta[]): DriveApi {
  return {
    listChildren: async (folderId) => files.filter((f) => f.parents.includes(folderId)),
    getFile: async (id) => files.find((f) => f.id === id) ?? null,
    download: async () => Buffer.from(''),
    exportFile: async () => Buffer.from(''),
    getStartPageToken: async () => '1',
    listChanges: async () => ({ changes: [], newStartPageToken: '1' }),
  };
}

describe('crypto', () => {
  it('ida e volta e detecção de adulteração', () => {
    const enc = encryptSecret('refresh-token-secreto');
    expect(enc).not.toContain('refresh-token-secreto');
    expect(decryptSecret(enc)).toBe('refresh-token-secreto');
    const [iv, tag] = enc.split('.');
    expect(() => decryptSecret([iv, tag, Buffer.from('xx').toString('base64')].join('.'))).toThrow();
  });
});

describe('oauth', () => {
  beforeEach(async () => {
    await resetDb();
    process.env.GOOGLE_CLIENT_ID = 'cid';
    process.env.GOOGLE_CLIENT_SECRET = 'secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/google/callback';
  });
  it('URL de autorização pede só drive.readonly, offline e state', () => {
    const url = new URL(buildAuthUrl('estado123'));
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')).toBe('estado123');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/google/callback');
  });
  it('token salvo criptografado; cliente autorizado; desconectar limpa token e cache', async () => {
    expect(await getAuthorizedClient()).toBeNull();
    await saveRefreshToken('rt-123', 'heitor@example.com', 'https://www.googleapis.com/auth/drive.readonly');
    const row = await prisma.googleToken.findUnique({ where: { id: 1 } });
    expect(row!.refreshTokenEnc).not.toContain('rt-123');
    const client = await getAuthorizedClient();
    expect(client!.credentials.refresh_token).toBe('rt-123');
    expect(await getGoogleConnection()).toMatchObject({ connected: true, email: 'heitor@example.com' });

    await prisma.source.create({ data: { fileId: 'f', name: 'n', mimeType: 'm', webUrl: 'u', modifiedAt: new Date(), versionOrHash: 'v', extractedText: 'texto' } });
    const revoke = vi.spyOn(Object.getPrototypeOf(client!), 'revokeToken').mockResolvedValue({} as never);
    await disconnectGoogle();
    revoke.mockRestore();
    expect(await prisma.googleToken.count()).toBe(0);
    expect((await prisma.source.findUnique({ where: { fileId: 'f' } }))!.extractedText).toBeNull();
    expect((await prisma.syncState.findUnique({ where: { id: 1 } }))!.status).toBe('auth_required');
  });
  it('maskEmail esconde o usuário', () => {
    expect(maskEmail('heitorgiometti@gmail.com')).toBe('he***@gmail.com');
    expect(maskEmail(null)).toBe('conta não identificada');
  });
});

describe('retry', () => {
  const sleep = async () => {};
  it('repete em 429/5xx e desiste após o limite', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new DriveError('limite', 429)).mockResolvedValue('ok');
    expect(await withRetry(fn, { sleep })).toBe('ok');
    const always = vi.fn().mockRejectedValue(new DriveError('erro', 503));
    await expect(withRetry(always, { retries: 3, sleep })).rejects.toThrow('erro');
    expect(always).toHaveBeenCalledTimes(4);
  });
  it('não repete 404/403 comuns', async () => {
    const fn = vi.fn().mockRejectedValue(new DriveError('não encontrado', 404));
    await expect(withRetry(fn, { sleep })).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(isRetryable(new DriveError('rate', 403, 'userRateLimitExceeded'))).toBe(true);
    expect(isRetryable(new DriveError('perm', 403, 'insufficientFilePermissions'))).toBe(false);
  });
});

describe('árvore', () => {
  const files = [
    meta('sub', 'Atas', ['root'], FOLDER_MIME),
    meta('a', 'INDEX.md', ['root']),
    meta('b', 'Ata_2026-10-04.md', ['sub']),
    meta('loop', 'Atalho', ['sub'], FOLDER_MIME),
    meta('loop-child', 'x.md', ['loop']),
    meta('fora', 'fora.md', ['outra-pasta']),
  ];
  it('percorre subpastas com caminhos e sem sair da raiz', async () => {
    const { files: found, folderPaths } = await walkTree(fakeApi(files), 'root', 'LIA case teste');
    expect(found.map((f) => `${f.path}/${f.name}`).sort()).toEqual(['LIA case teste/Atas/Ata_2026-10-04.md', 'LIA case teste/Atas/Atalho/x.md', 'LIA case teste/INDEX.md']);
    expect(folderPaths).toMatchObject({ root: 'LIA case teste', sub: 'LIA case teste/Atas' });
  });
  it('isInsideTree usa pastas conhecidas e sobe pelos pais quando preciso', async () => {
    const api = fakeApi([...files, meta('nova', 'Nova', ['sub'], FOLDER_MIME), meta('n1', 'n1.md', ['nova'])]);
    const folderPaths: Record<string, string> = { root: 'LIA', sub: 'LIA/Atas' };
    expect(await isInsideTree(api, meta('b', 'b', ['sub']), folderPaths, 'root')).toEqual({ path: 'LIA/Atas' });
    expect(await isInsideTree(api, meta('n1', 'n1.md', ['nova']), folderPaths, 'root')).toEqual({ path: 'LIA/Atas/Nova' });
    expect(folderPaths.nova).toBe('LIA/Atas/Nova');
    expect(await isInsideTree(api, meta('fora', 'fora.md', ['outra-pasta']), folderPaths, 'root')).toBeNull();
  });
});

describe('toDriveFileMeta', () => {
  it('normaliza campos ausentes', () => {
    expect(toDriveFileMeta({ id: 'x', name: 'Doc', mimeType: 'application/vnd.google-apps.document', modifiedTime: 't', version: '7', webViewLink: 'l', parents: ['p'], capabilities: { canDownload: true } })).toEqual({
      id: 'x', name: 'Doc', mimeType: 'application/vnd.google-apps.document', modifiedTime: 't', md5Checksum: null, version: '7', webViewLink: 'l', parents: ['p'], trashed: false, canDownload: true,
    });
  });
});

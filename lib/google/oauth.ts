import { google } from 'googleapis';
import { prisma } from '@/lib/db';
import { decryptSecret, encryptSecret } from './crypto';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
export class ConfigError extends Error {}

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI && process.env.TOKEN_ENC_KEY);
}

export function getOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) throw new ConfigError('Credenciais OAuth do Google não configuradas no .env');
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

export function buildAuthUrl(state: string): string {
  return getOAuthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: [DRIVE_SCOPE], state, include_granted_scopes: false });
}

export async function saveRefreshToken(token: string, email: string | null, scope: string): Promise<void> {
  const data = { refreshTokenEnc: encryptSecret(token), accountEmail: email, scope };
  await prisma.googleToken.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
  await prisma.syncState.update({ where: { id: 1 }, data: { status: 'idle', lastError: null } });
}

export async function exchangeCode(code: string): Promise<void> {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error('O Google não devolveu refresh token. Remova o acesso do app em myaccount.google.com/connections e conecte de novo.');
  }
  client.setCredentials(tokens);
  const about = await google.drive({ version: 'v3', auth: client }).about.get({ fields: 'user(emailAddress)' });
  await saveRefreshToken(tokens.refresh_token, about.data.user?.emailAddress ?? null, tokens.scope ?? DRIVE_SCOPE);
}

export async function getAuthorizedClient() {
  const row = await prisma.googleToken.findUnique({ where: { id: 1 } });
  if (!row) return null;
  const client = getOAuthClient();
  client.setCredentials({ refresh_token: decryptSecret(row.refreshTokenEnc) });
  return client;
}

export async function disconnectGoogle(): Promise<void> {
  const client = await getAuthorizedClient().catch(() => null);
  const token = client?.credentials.refresh_token;
  if (client && token) {
    try {
      await client.revokeToken(token);
    } catch {
      // token já revogado ou expirado: segue limpando os dados locais
    }
  }
  await prisma.googleToken.deleteMany();
  await prisma.source.updateMany({ data: { extractedText: null } });
  await prisma.syncState.update({ where: { id: 1 }, data: { status: 'auth_required', startPageToken: null } });
}

export function maskEmail(email: string | null): string {
  if (!email) return 'conta não identificada';
  const [user, domain] = email.split('@');
  return `${user.slice(0, 2)}***@${domain}`;
}

export async function getGoogleConnection(): Promise<{ connected: boolean; email: string | null; scope: string | null }> {
  const row = await prisma.googleToken.findUnique({ where: { id: 1 } });
  return { connected: Boolean(row), email: row?.accountEmail ?? null, scope: row?.scope ?? null };
}

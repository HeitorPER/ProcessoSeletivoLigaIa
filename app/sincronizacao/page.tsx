import { DisconnectButton } from '@/components/sync/DisconnectButton';
import { SourcesTable } from '@/components/sync/SourcesTable';
import { SyncNowButton } from '@/components/sync/SyncNowButton';
import { Notice } from '@/components/ui/Notice';
import { PageHeader } from '@/components/ui/PageHeader';
import { getProvider } from '@/lib/ai';
import { RULES_PROVIDER_NAME } from '@/lib/ai/rules';
import { formatDateTimeBR } from '@/lib/dates';
import { prisma } from '@/lib/db';
import { getGoogleConnection, isGoogleConfigured, maskEmail } from '@/lib/google/oauth';
import { describeSyncState } from '@/lib/sync/describe';

const ERRORS: Record<string, string> = {
  config: 'Credenciais do Google não configuradas. Preencha GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI e TOKEN_ENC_KEY no .env e reinicie.',
  state: 'A resposta do Google não confere com o pedido (proteção contra CSRF). Tente conectar de novo.',
  troca: 'Não foi possível concluir a conexão com o Google. Veja o terminal do servidor e tente de novo.',
  negado: 'O acesso não foi autorizado na tela do Google.',
};

export default async function SincronizacaoPage({ searchParams }: { searchParams: Promise<{ erro?: string; conectado?: string }> }) {
  const sp = await searchParams;
  const [state, conn, sources, runs] = await Promise.all([
    prisma.syncState.findUnique({ where: { id: 1 } }),
    getGoogleConnection(),
    prisma.source.findMany({ orderBy: [{ path: 'asc' }, { name: 'asc' }] }),
    prisma.syncRun.findMany({ orderBy: { startedAt: 'desc' }, take: 5 }),
  ]);
  const folderId = process.env.DRIVE_TEST_FOLDER_ID;
  const status = describeSyncState({ state, connected: conn.connected, now: new Date() });
  const provider = getProvider().name;
  const count = (s: string) => sources.filter((x) => x.syncStatus === s).length;
  const incrementalMin = Number(process.env.SYNC_INCREMENTAL_MS ?? 120_000) / 60_000;
  const fullMin = Number(process.env.SYNC_FULL_MS ?? 600_000) / 60_000;

  return (
    <>
      <PageHeader title="Estado da sincronização" description="De onde vêm os documentos, quando foram lidos pela última vez e o que não pôde ser processado." />
      {sp.conectado && <Notice tone="ok" live title="Conta Google conectada">A primeira sincronização começa em instantes.</Notice>}
      {sp.erro && <Notice tone="error" live title="Conexão não concluída">{ERRORS[sp.erro] ?? 'Erro desconhecido.'}</Notice>}

      <section aria-labelledby="conexao" className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 id="conexao" className="text-xl font-semibold">Pasta conectada</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-medium">Pasta</dt>
            <dd>{folderId ? <a href={`https://drive.google.com/drive/folders/${folderId}`} target="_blank" rel="noopener noreferrer" className="text-brand underline">{state?.folderName ?? 'Abrir no Drive'}<span className="sr-only"> (abre no Google Drive)</span></a> : <span className="text-danger">Não configurada (DRIVE_TEST_FOLDER_ID)</span>}</dd>
            <dt className="font-medium">Conta</dt>
            <dd>{conn.connected ? maskEmail(conn.email) : 'Nenhuma conta conectada'}</dd>
            <dt className="font-medium">Permissão</dt>
            <dd>Somente leitura (drive.readonly). Só esta pasta e suas subpastas são lidas; nada é alterado no Drive.</dd>
            <dt className="font-medium">IA</dt>
            <dd>{provider === RULES_PROVIDER_NAME ? 'Desativada — extração por regras' : provider}</dd>
          </dl>
          <div className="mt-4 flex flex-wrap gap-3">
            {isGoogleConfigured() && <a href="/api/google/connect" className="rounded border border-brand px-4 py-2 font-semibold text-brand">{conn.connected ? 'Reconectar conta Google' : 'Conectar conta Google'}</a>}
            {conn.connected && <DisconnectButton />}
          </div>
        </div>
        <div>
          <h2 className="text-xl font-semibold">Situação</h2>
          <p className={`mt-2 font-semibold ${status.tone === 'error' ? 'text-danger' : status.tone === 'warn' ? 'text-warn' : 'text-ok'}`}>{status.label}</p>
          {status.detail && <p className="text-sm">{status.detail}</p>}
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
            <dt className="font-medium">Último sucesso</dt><dd>{state?.lastSuccessAt ? formatDateTimeBR(state.lastSuccessAt) : '—'}</dd>
            <dt className="font-medium">Última falha</dt><dd>{state?.lastErrorAt ? `${formatDateTimeBR(state.lastErrorAt)} — ${state.lastError ?? ''}` : '—'}</dd>
            <dt className="font-medium">Próximo ciclo</dt><dd>{state?.nextRunAt ? formatDateTimeBR(state.nextRunAt) : '—'}</dd>
            <dt className="font-medium">Frequência</dt><dd>Mudanças a cada {incrementalMin} min; varredura completa a cada {fullMin} min</dd>
          </dl>
          <div className="mt-4"><SyncNowButton /></div>
        </div>
      </section>

      <section aria-labelledby="contagem" className="mt-8">
        <h2 id="contagem" className="text-xl font-semibold">Arquivos</h2>
        <p className="mt-1">Processados: <strong>{count('processed')}</strong> · Ignorados: <strong>{count('ignored')}</strong> · Com erro: <strong>{count('error')}</strong> · Indisponíveis: <strong>{count('unavailable')}</strong></p>
        <div className="mt-3"><SourcesTable rows={sources} /></div>
      </section>

      <section aria-labelledby="execucoes" className="mt-8">
        <h2 id="execucoes" className="text-xl font-semibold">Últimas execuções</h2>
        {runs.length === 0 ? <p className="text-muted">Nenhuma execução ainda.</p> : (
          <ul className="mt-2 space-y-1 text-[15px]">
            {runs.map((r) => (
              <li key={r.id}>{formatDateTimeBR(r.startedAt)} · {r.mode} · {r.processed} processados, {r.ignored} ignorados, {r.errors} com erro, {r.unavailable} indisponíveis, {r.unchanged} sem mudança{r.error ? <span className="text-danger"> — falha: {r.error}</span> : ''}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

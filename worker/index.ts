import 'dotenv/config';
import { getProvider } from '@/lib/ai';
import { prisma } from '@/lib/db';
import { createDriveApi } from '@/lib/drive/client';
import { getAuthorizedClient } from '@/lib/google/oauth';
import { describeError, runCycle } from '@/lib/sync/engine';
import { decideRun } from '@/lib/sync/schedule';

const INCREMENTAL_MS = Number(process.env.SYNC_INCREMENTAL_MS ?? 120_000);
const FULL_MS = Number(process.env.SYNC_FULL_MS ?? 600_000);
const TICK_MS = 5_000;

let busy = false;
let lastRunAt: number | null = null;

async function setState(data: Record<string, unknown>) {
  await prisma.syncState.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });
}

async function closeRequests(upTo: Date) {
  await prisma.syncRequest.updateMany({ where: { handledAt: null, createdAt: { lte: upTo } }, data: { handledAt: new Date() } });
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    await setState({ workerHeartbeatAt: new Date() });
    const request = await prisma.syncRequest.findFirst({ where: { handledAt: null }, orderBy: { createdAt: 'asc' } });
    const state = await prisma.syncState.findUnique({ where: { id: 1 } });
    const mode = decideRun({
      hasRequest: Boolean(request), lastRunAt, lastFullScanAt: state?.lastFullScanAt?.getTime() ?? null,
      now: Date.now(), incrementalMs: INCREMENTAL_MS, fullMs: FULL_MS,
    });
    if (!mode) return;
    const requestCutoff = new Date();
    let skippedByLock = false;

    const folderId = process.env.DRIVE_TEST_FOLDER_ID;
    if (!folderId) {
      await setState({ status: 'error', lastError: 'DRIVE_TEST_FOLDER_ID não configurado no .env', lastErrorAt: new Date() });
    } else {
      const auth = await getAuthorizedClient().catch((e) => {
        console.error('[worker] não foi possível ler o token do Google:', describeError(e));
        return null;
      });
      if (!auth) {
        await setState({ status: 'auth_required', lastError: null });
      } else {
        const summary = await runCycle({ api: createDriveApi(auth), provider: getProvider(), rootFolderId: folderId }, mode);
        skippedByLock = summary.skipped === 'locked';
        console.log(
          `[worker] ciclo ${summary.mode}${summary.skipped ? ' (ignorado: outro ciclo em andamento)' : ''}: ` +
            `${summary.processed} processados, ${summary.ignored} ignorados, ${summary.errors} com erro, ` +
            `${summary.unavailable} indisponíveis, ${summary.unchanged} sem mudança${summary.error ? ` — falha: ${summary.error}` : ''}`,
        );
      }
    }
    lastRunAt = Date.now();
    await setState({ nextRunAt: new Date(lastRunAt + INCREMENTAL_MS) });
    if (request && !skippedByLock) await closeRequests(requestCutoff); // pedido ignorado pelo lock fica para o próximo tick
  } catch (e) {
    console.error('[worker] erro no ciclo:', describeError(e));
  } finally {
    busy = false;
  }
}

async function main() {
  await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL;');
  await setState({ runningSince: null });
  console.log(`[worker] iniciado — incremental a cada ${INCREMENTAL_MS / 1000}s, varredura a cada ${FULL_MS / 1000}s`);
  await tick();
  setInterval(() => void tick(), TICK_MS);
}

main().catch((e) => {
  console.error('[worker] falha ao iniciar:', describeError(e));
  process.exit(1);
});

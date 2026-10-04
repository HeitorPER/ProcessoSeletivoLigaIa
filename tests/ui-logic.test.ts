import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { emptyFields } from '@/lib/activity-fields';
import { createActivity } from '@/lib/activities/service';
import { prisma } from '@/lib/db';
import { getOnboarding } from '@/lib/onboarding';
import { describeSyncState } from '@/lib/sync/describe';
import { ensureFirstVisit, touchVisit } from '@/lib/visits';
import { resetDb } from './helpers/db';

const NOW = new Date('2026-10-03T15:00:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);
const base = { status: 'idle', lastSuccessAt: ago(3), lastErrorAt: null, lastError: null, workerHeartbeatAt: ago(0.2) };

describe('describeSyncState', () => {
  it('cobre desconectado, reconexão, worker parado, falha, rodando e ok', () => {
    expect(describeSyncState({ state: base, connected: false, now: NOW })).toMatchObject({ label: 'Desconectado do Drive', tone: 'warn' });
    expect(describeSyncState({ state: { ...base, status: 'auth_required' }, connected: true, now: NOW })).toMatchObject({ tone: 'error', label: 'Reconexão com o Google necessária' });
    expect(describeSyncState({ state: { ...base, workerHeartbeatAt: ago(5) }, connected: true, now: NOW }).label).toContain('Sincronizador parado');
    const failed = describeSyncState({ state: { ...base, status: 'error', lastError: 'backendError (HTTP 500)' }, connected: true, now: NOW });
    expect(failed).toMatchObject({ tone: 'error', detail: 'backendError (HTTP 500)' });
    expect(failed.label).toContain('Falha na sincronização');
    expect(describeSyncState({ state: { ...base, status: 'running' }, connected: true, now: NOW }).label).toBe('Sincronizando…');
    expect(describeSyncState({ state: base, connected: true, now: NOW })).toMatchObject({ label: 'Sincronizado há 3 min', tone: 'ok' });
    expect(describeSyncState({ state: { ...base, lastSuccessAt: ago(30) }, connected: true, now: NOW }).tone).toBe('warn');
    expect(describeSyncState({ state: { ...base, lastSuccessAt: null }, connected: true, now: NOW }).label).toBe('Aguardando primeira sincronização');
  });
});

describe('visitas', () => {
  beforeEach(resetDb);
  it('primeira visita é detectada uma vez', async () => {
    expect(await ensureFirstVisit('U-A', NOW)).toBe(true);
    expect(await ensureFirstVisit('U-A', NOW)).toBe(false);
  });
  it('touchVisit devolve a visita anterior e só avança após 30 min', async () => {
    expect(await touchVisit('U-D', ago(120))).toBeNull();
    expect((await touchVisit('U-D', ago(60)))!.getTime()).toBe(ago(120).getTime());
    expect((await touchVisit('U-D', ago(50)))!.getTime()).toBe(ago(120).getTime());
    expect((await touchVisit('U-D', NOW))!.getTime()).toBe(ago(60).getTime());
  });
});

describe('getOnboarding', () => {
  const read = (p: string) => readFileSync(path.join(__dirname, 'fixtures/01_CARGA_INICIAL', p), 'utf8');
  const src = (fileId: string, kind: string, text: string | null, syncStatus = 'processed') =>
    prisma.source.create({ data: { fileId, name: fileId, mimeType: 'text/markdown', webUrl: `https://drive/${fileId}`, modifiedAt: NOW, versionOrHash: 'v1', kind, syncStatus, extractedText: text } });

  beforeEach(resetDb);
  it('monta propósito provisório, frentes, histórico, fonte e primeira ação', async () => {
    await src('ESTADO-ATUAL.md', 'direction', read('ESTADO-ATUAL.md'));
    await src('GUIA_INICIAL.md', 'direction', read('GUIA_INICIAL.md'));
    await src('PLANO_EDITORIAL_ANTIGO.md', 'deprecated', read('PLANO_EDITORIAL_ANTIGO.md'));
    await src('Ata_registro.xlsx', 'activity_registry', null);
    await prisma.syncState.update({ where: { id: 1 }, data: { authorityFileId: 'Ata_registro.xlsx', authoritySheet: 'Atividades', initialImportAt: NOW } });
    await createActivity({ ...emptyFields(), title: 'Revisar fluxo', dueDate: '2026-10-11', ownerIds: ['U-A'] }, 'system', { origin: 'import', id: 'ACT-104' });
    await createActivity({ ...emptyFields(), title: 'Preparar carrossel', dueDate: '2026-10-05', ownerIds: ['U-A'] }, 'system', { origin: 'import', id: 'ACT-101' });

    const o = await getOnboarding('U-A', '2026-10-03');
    expect(o.purpose.provisional).toBe(true);
    expect(o.purpose.confirmBy).toBe('Bruno');
    expect(o.purpose.text).toContain('treina pessoas para aplicar IA');
    expect(o.purpose.text).not.toContain('status: parcial');
    expect(o.fronts.text).toContain('Growth');
    expect(o.howWeWork.history.map((h) => h.name)).toEqual(['PLANO_EDITORIAL_ANTIGO.md']);
    expect(o.activitySource).toMatchObject({ sheet: 'Atividades' });
    expect(o.activitySource.registry?.name).toBe('Ata_registro.xlsx');
    expect(o.firstAction?.id).toBe('ACT-101');
    expect(o.gaps.join(' ')).toContain('provisório');
  });
  it('lacunas quando nada foi sincronizado e membro sem atividade', async () => {
    const o = await getOnboarding('U-B', '2026-10-03');
    expect(o.purpose.text).toBeNull();
    expect(o.firstAction).toBeNull();
    expect(o.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('ESTADO-ATUAL'),
      expect.stringContaining('GUIA_INICIAL'),
      expect.stringContaining('Fonte de atividades'),
      expect.stringContaining('ainda não tem atividade'),
    ]));
  });
  it('documento indisponível aparece como lacuna, sem texto antigo', async () => {
    await src('ESTADO-ATUAL.md', 'direction', null, 'unavailable');
    const o = await getOnboarding('U-A', '2026-10-03');
    expect(o.purpose.text).toBeNull();
    expect(o.gaps.join(' ')).toContain('indisponível');
  });
  it('documento marcado como indisponível nunca mostra texto antigo (ESTADO-ATUAL e GUIA_INICIAL)', async () => {
    await src('ESTADO-ATUAL.md', 'direction', read('ESTADO-ATUAL.md'), 'unavailable');
    await src('GUIA_INICIAL.md', 'direction', read('GUIA_INICIAL.md'), 'unavailable');
    const o = await getOnboarding('U-A', '2026-10-03');
    expect(o.purpose.text).toBeNull();
    expect(o.fronts.text).toBeNull();
    expect(o.howWeWork.text).toBeNull();
    expect(o.gaps).toEqual(expect.arrayContaining([
      expect.stringContaining('ESTADO-ATUAL.md está indisponível no momento'),
      expect.stringContaining('GUIA_INICIAL.md está indisponível no momento'),
    ]));
  });
});

describe('visitas concorrentes', () => {
  beforeEach(resetDb);
  it('duas primeiras visitas simultâneas não falham e só uma é "primeira"', async () => {
    const results = await Promise.all([ensureFirstVisit('U-C', NOW), ensureFirstVisit('U-C', NOW)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(Promise.all([touchVisit('U-B', NOW), touchVisit('U-B', NOW)])).resolves.toBeDefined();
  });
});

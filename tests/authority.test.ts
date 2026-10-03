import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIndex } from '@/lib/authority/index-parser';
import { classify, isActivitySheet, isIndexFile, sameFileName, type AuthorityState } from '@/lib/authority/classify';
import type { MarkdownDoc, Sheet, SpreadsheetDoc } from '@/lib/types';

const md = (text: string, frontMatter: Record<string, string> = {}): MarkdownDoc => ({ kind: 'markdown', text, frontMatter, sections: [] });
const HEADERS = ['ID', 'Atividade', 'Responsáveis', 'Prazo', 'Frente', 'Prioridade', 'Status', 'Próximo passo', 'Origem', 'Notas e bloqueios'];
const sheet = (name: string, rows = 0): Sheet => ({
  name,
  headers: HEADERS,
  rows: Array.from({ length: rows }, (_, i) => ({ rowNumber: i + 2, cells: { ID: `ACT-10${i + 1}` }, cellRefs: { ID: `A${i + 2}` } })),
});
const xlsx = (...sheets: Sheet[]): SpreadsheetDoc => ({ kind: 'spreadsheet', sheets });

const indexText = readFileSync(path.join(__dirname, 'fixtures/01_CARGA_INICIAL/INDEX.md'), 'utf8');
const config = parseIndex(md(indexText));
const authority: AuthorityState = { config, registryFileId: null };

describe('parseIndex', () => {
  it('extrai a fonte vigente e a aba do INDEX.md do pacote', () => {
    expect(config.registryFileName).toBe('Ata_registro.xlsx');
    expect(config.registrySheet).toBe('Atividades');
  });
  it('extrai arquivos superados', () => {
    expect(config.supersededFileNames).toEqual(['PLANO_EDITORIAL_ANTIGO.md']);
  });
  it('INDEX sem fonte → nulos', () => {
    expect(parseIndex(md('# Índice\n\n- `x.md`: algo'))).toEqual({ registryFileName: null, registrySheet: null, supersededFileNames: [] });
  });
});

describe('helpers', () => {
  it('isIndexFile e sameFileName', () => {
    expect(isIndexFile('INDEX.md')).toBe(true);
    expect(isIndexFile('index')).toBe(true);
    expect(isIndexFile('INDEX antigo.md')).toBe(false);
    expect(sameFileName('Ata_registro.xlsx', 'ata_registro')).toBe(true);
    expect(sameFileName('Ata_registro.xlsx', 'Ata - copia vazia.xlsx')).toBe(false);
  });
  it('isActivitySheet reconhece o cabeçalho de atividades', () => {
    expect(isActivitySheet(sheet('Ata'))).toBe(true);
    expect(isActivitySheet({ name: 'X', headers: ['Nome', 'Valor'], rows: [] })).toBe(false);
  });
});

describe('classify', () => {
  const base = { fileId: 'f1', mimeType: 'text/markdown' };
  it('INDEX → direction', () => {
    expect(classify({ ...base, name: 'INDEX.md', doc: md(indexText, { status: 'ativo' }) }, authority).kind).toBe('direction');
  });
  it('plano antigo → deprecated (front-matter ou INDEX)', () => {
    expect(classify({ ...base, name: 'PLANO_EDITORIAL_ANTIGO.md', doc: md('# x', { status: 'deprecated', substituido_por: 'GUIA_INICIAL.md em 2026-10-01' }) }, authority)).toMatchObject({ kind: 'deprecated', reason: 'Histórico — substituído por GUIA_INICIAL.md em 2026-10-01' });
    expect(classify({ ...base, name: 'PLANO_EDITORIAL_ANTIGO.md', doc: md('# x', { status: 'ativo' }) }, authority).kind).toBe('deprecated');
  });
  it('atas → minutes com data da reunião', () => {
    expect(classify({ ...base, name: 'Ata_2026-10-04.md', doc: md('# Ata', { data_da_reuniao: '2026-10-04' }) }, authority)).toMatchObject({ kind: 'minutes', meetingDate: '2026-10-04' });
    // Google Doc nativo sem extensão e sem front-matter
    expect(classify({ ...base, mimeType: 'application/vnd.google-apps.document', name: 'Ata_2026-10-03', doc: md('# Ata de reunião de 3 de outubro') }, authority)).toMatchObject({ kind: 'minutes', meetingDate: '2026-10-03' });
    // nome livre, mas título de reunião
    expect(classify({ ...base, name: 'Encontro Growth.md', doc: md('# Reunião de Growth\n\nAna fará X.') }, authority).kind).toBe('minutes');
  });
  it('ESTADO-ATUAL e GUIA_INICIAL → direction; outros → other', () => {
    expect(classify({ ...base, name: 'ESTADO-ATUAL.md', doc: md('# Estado', { status: 'parcial' }) }, authority).kind).toBe('direction');
    expect(classify({ ...base, name: 'GUIA_INICIAL.md', doc: md('# Comece aqui', { status: 'ativo' }) }, authority).kind).toBe('direction');
    expect(classify({ ...base, name: 'Notas soltas.md', doc: md('# Notas') }, authority).kind).toBe('other');
  });
  it('planilha apontada pelo INDEX → activity_registry com a aba', () => {
    expect(classify({ ...base, name: 'Ata_registro.xlsx', doc: xlsx(sheet('Atividades', 4)) }, authority)).toMatchObject({ kind: 'activity_registry', registrySheet: 'Atividades' });
  });
  it('planilha vazia homônima → unauthorized_sheet', () => {
    const c = classify({ ...base, fileId: 'f9', name: 'Ata - copia vazia.xlsx', doc: xlsx(sheet('Ata')) }, authority);
    expect(c.kind).toBe('unauthorized_sheet');
    expect(c.reason).toContain('Ata_registro.xlsx');
  });
  it('mesmo nome da fonte vigente com outro fileId após importação → unauthorized_sheet', () => {
    const c = classify({ ...base, fileId: 'outra-copia', name: 'Ata_registro.xlsx', doc: xlsx(sheet('Atividades', 4)) }, { config, registryFileId: 'original' });
    expect(c.kind).toBe('unauthorized_sheet');
  });
  it('fonte vigente sem a aba indicada → unauthorized_sheet com motivo', () => {
    const c = classify({ ...base, name: 'Ata_registro.xlsx', doc: xlsx(sheet('Outra')) }, authority);
    expect(c).toMatchObject({ kind: 'unauthorized_sheet' });
    expect(c.reason).toContain('Atividades');
  });
  it('sem INDEX: planilha de atividades aguarda definição', () => {
    const c = classify({ ...base, name: 'Ata_registro.xlsx', doc: xlsx(sheet('Atividades', 4)) }, { config: null, registryFileId: null });
    expect(c.kind).toBe('other');
    expect(c.reason).toContain('INDEX.md');
  });
  it('planilha sem formato de atividades → other', () => {
    expect(classify({ ...base, name: 'Orçamento.xlsx', doc: xlsx({ name: 'A', headers: ['Item', 'Valor'], rows: [] }) }, authority).kind).toBe('other');
  });
});

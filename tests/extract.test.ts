import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFrontMatter } from '@/lib/extract/frontmatter';
import { findSectionFor, normalizeGoogleDocMarkdown, parseMarkdown, stripFrontMatterLines } from '@/lib/extract/markdown';
import { parseXlsx } from '@/lib/extract/xlsx';
import { docToStoredText, extractDoc, storedTextToDoc } from '@/lib/extract';

const fx = (p: string) => path.join(__dirname, 'fixtures', p);
const readText = (p: string) => readFileSync(fx(p), 'utf8');

describe('front-matter', () => {
  it('lê o bloco "chave: valor" após o título (formato do acervo)', () => {
    const { data } = parseFrontMatter(readText('01_CARGA_INICIAL/INDEX.md'));
    expect(data.status).toBe('ativo');
    expect(data.atualizado_em).toBe('2026-10-01');
    expect(data.escopo).toBe('pasta de teste do case');
  });
  it('lê front-matter YAML com ---', () => {
    expect(parseFrontMatter('---\nstatus: deprecated\n---\n# T').data.status).toBe('deprecated');
  });
  it('aceita linhas em branco entre pares (Google Docs)', () => {
    const { data } = parseFrontMatter('# Ata\n\nstatus: ativo\n\ndata_da_reuniao: 2026-10-03\n\nParticiparam Ana e Bruno.');
    expect(data).toEqual({ status: 'ativo', data_da_reuniao: '2026-10-03' });
  });
  it('não trata corpo como front-matter', () => {
    expect(parseFrontMatter('# T\n\nTexto comum.\n\nchave: valor').data).toEqual({});
  });
});

describe('markdown', () => {
  it('ata de 03/10: front-matter e seções', () => {
    const doc = parseMarkdown(readText('02_ADICIONAR_DEPOIS_DA_CARGA/Ata_2026-10-03.md'));
    expect(doc.kind).toBe('markdown');
    expect(doc.frontMatter.data_da_reuniao).toBe('2026-10-03');
    const sec = doc.sections.find((s) => s.heading === 'Mudança confirmada na reunião');
    expect(sec?.text).toContain('**2026-10-07**');
    expect(findSectionFor(doc, 'O prazo para entregar a versão de aprovação mudou de 2026-10-05 para 2026-10-07')?.heading).toBe('Mudança confirmada na reunião');
  });
  it('título em negrito exportado do Google Docs vira texto simples', () => {
    const doc = parseMarkdown('# **Ata 03/10**\n\n## **Mudança confirmada na reunião**\n\nO prazo mudou para 2026-10-07.\n\n## __Outra__ seção');
    expect(doc.sections.map((s) => s.heading)).toEqual(['Ata 03/10', 'Mudança confirmada na reunião', 'Outra seção']);
  });
  it('plano antigo é reconhecido como deprecated', () => {
    const doc = parseMarkdown(readText('01_CARGA_INICIAL/PLANO_EDITORIAL_ANTIGO.md'));
    expect(doc.frontMatter.status).toBe('deprecated');
    expect(doc.frontMatter.substituido_por).toContain('GUIA_INICIAL.md');
  });
  it('normaliza CRLF e BOM', () => {
    const doc = parseMarkdown('\uFEFF# A\r\n\r\nstatus: ativo\r\n\r\n## B\r\ntexto');
    expect(doc.frontMatter.status).toBe('ativo');
    expect(doc.sections.map((s) => s.heading)).toEqual(['A', 'B']);
    expect(doc.text.includes('\r')).toBe(false);
  });
  it('Google Docs exportado como markdown: escapes e espaço não separável', () => {
    const exported = '# Ata de reunião\n\nstatus: ativo\n\ndata\\_da\\_reuniao: 2026\\-10\\-03\n\nO prazo mudou para **2026\\-10\\-07**.\u00A0Fim.';
    const doc = parseMarkdown(normalizeGoogleDocMarkdown(exported));
    expect(doc.frontMatter.data_da_reuniao).toBe('2026-10-03');
    expect(doc.text).toContain('**2026-10-07**. Fim.');
  });
  it('stripFrontMatterLines remove só o bloco inicial', () => {
    const out = stripFrontMatterLines('# T\n\nstatus: parcial\natualizado_em: 2026-10-01\n\nCorpo: com dois pontos.');
    expect(out).not.toContain('status: parcial');
    expect(out).toContain('Corpo: com dois pontos.');
  });
});

describe('xlsx', () => {
  it('lê o registro inicial com datas e referências de célula', () => {
    const doc = parseXlsx(readFileSync(fx('01_CARGA_INICIAL/Ata_registro.xlsx')));
    const sheet = doc.sheets.find((s) => s.name === 'Atividades')!;
    expect(sheet.headers).toContain('Responsáveis');
    expect(sheet.rows).toHaveLength(4);
    const act101 = sheet.rows.find((r) => r.cells.ID === 'ACT-101')!;
    expect(act101.cells.Prazo).toBe('2026-10-05');
    expect(act101.cellRefs.Prazo).toBe('D2');
    expect(act101.rowNumber).toBe(2);
    expect(sheet.rows.find((r) => r.cells.ID === 'ACT-104')!.cells['Responsáveis']).toBe('Ana; Davi');
    expect(sheet.rows.find((r) => r.cells.ID === 'ACT-103')!.cells.Status).toBe('Bloqueada');
  });
  it('planilha vazia homônima tem cabeçalho e zero linhas', () => {
    const doc = parseXlsx(readFileSync(fx('03_CONFLITO/Ata - copia vazia.xlsx')));
    expect(doc.sheets[0].name).toBe('Ata');
    expect(doc.sheets[0].headers.filter(Boolean)).toHaveLength(10);
    expect(doc.sheets[0].rows).toHaveLength(0);
  });
});

describe('extractDoc', () => {
  it('markdown e xlsx', async () => {
    expect((await extractDoc({ format: 'markdown', text: '# A' })).kind).toBe('markdown');
    const sheet = await extractDoc({ format: 'xlsx', buffer: readFileSync(fx('01_CARGA_INICIAL/Ata_registro.xlsx')) });
    expect(sheet.kind).toBe('spreadsheet');
  });
  it('PDF inválido gera erro (nunca "vazio")', async () => {
    await expect(extractDoc({ format: 'pdf', buffer: Buffer.from('não é pdf') })).rejects.toThrow();
  });
  it('docToStoredText/storedTextToDoc fazem ida e volta', async () => {
    const sheet = await extractDoc({ format: 'xlsx', buffer: readFileSync(fx('01_CARGA_INICIAL/Ata_registro.xlsx')) });
    expect(storedTextToDoc(docToStoredText(sheet))).toEqual(sheet);
    const md = parseMarkdown('# A\n\ntexto');
    expect(storedTextToDoc(docToStoredText(md))).toEqual(md);
  });
});

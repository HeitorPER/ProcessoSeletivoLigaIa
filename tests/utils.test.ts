import { describe, expect, it } from 'vitest';
import { parseJson, stableStringify } from '@/lib/json';
import { jaccard, normalizeForMatch, normalizeName, textSimilar, tokenize, truncate } from '@/lib/text';
import { addDays, daysBetween, dueInfo, endOfDaySP, formatDateBR, isIsoDate, toIsoDateSP, todaySP } from '@/lib/dates';
import { diffFields, emptyFields, pickFields, sameFieldValue } from '@/lib/activity-fields';

describe('activity-fields', () => {
  it('diffFields é estrito (registra qualquer edição)', () => {
    const before = { ...emptyFields(), title: 'Preparar roteiro', ownerIds: ['U-A', 'U-D'] };
    expect(diffFields(before, { title: 'Preparar o roteiro' })).toEqual(['title']);
    expect(diffFields(before, { ownerIds: ['U-D', 'U-A'] })).toEqual([]);
    expect(diffFields(before, { dueDate: '2026-10-07', status: 'todo' })).toEqual(['dueDate']);
  });
  it('sameFieldValue é tolerante em textos e ignora ordem de responsáveis', () => {
    expect(sameFieldValue('nextStep', 'Obter confirmação do espaço', 'obter a confirmação do espaço')).toBe(true);
    expect(sameFieldValue('dueDate', '2026-10-05', '2026-10-07')).toBe(false);
    expect(sameFieldValue('ownerIds', ['U-A', 'U-D'], ['U-D', 'U-A'])).toBe(true);
    expect(sameFieldValue('front', null, undefined)).toBe(true);
  });
  it('pickFields copia só as chaves pedidas', () => {
    expect(pickFields({ title: 'x', dueDate: '2026-10-07', status: 'todo' }, ['dueDate'])).toEqual({ dueDate: '2026-10-07' });
  });
});

describe('json', () => {
  it('parseJson devolve fallback para vazio ou inválido', () => {
    expect(parseJson('{"a":1}', {})).toEqual({ a: 1 });
    expect(parseJson(null, [])).toEqual([]);
    expect(parseJson('{oops', { x: 1 })).toEqual({ x: 1 });
  });
  it('stableStringify ordena chaves recursivamente', () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe('{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}');
  });
});

describe('text', () => {
  it('normalizeName remove acentos, caixa e espaços extras', () => {
    expect(normalizeName('  Próximo Passo ')).toBe('proximo passo');
    expect(normalizeName('Formação')).toBe('formacao');
  });
  it('normalizeForMatch ignora markdown, aspas tipográficas e espaços', () => {
    expect(normalizeForMatch('mudou para **2026-10-07**.\n  Bruno')).toBe('mudou para 2026-10-07. bruno');
    expect(normalizeForMatch('“Talvez”  ‘ok’')).toBe('"talvez" \'ok\'');
  });
  it('tokenize e jaccard', () => {
    expect(tokenize('Preparar o carrossel, sobre ferramentas!')).toEqual(['preparar', 'carrossel', 'sobre', 'ferramentas']);
    expect(jaccard(['a', 'b'], ['a', 'b'])).toBe(1);
    expect(jaccard(['a', 'b'], ['c'])).toBe(0);
  });
  it('textSimilar tolera diferenças pequenas', () => {
    expect(textSimilar('Revisar material de entrada e propor primeira versão', 'revisar o material de entrada e propor a primeira versão')).toBe(true);
    expect(textSimilar('Fechar o roteiro e enviar para Bruno', 'Preparar roteiro e selecionar exemplos')).toBe(false);
    expect(textSimilar(null, null)).toBe(true);
    expect(textSimilar('x', null)).toBe(false);
  });
  it('truncate corta com reticências', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abc', 4)).toBe('abc');
  });
});

describe('dates', () => {
  it('endOfDaySP: último instante do dia em São Paulo', () => {
    expect(endOfDaySP('2026-10-01').toISOString()).toBe('2026-10-02T02:59:59.999Z');
    expect(toIsoDateSP(endOfDaySP('2026-10-01'))).toBe('2026-10-01');
  });
  it('isIsoDate valida formato e data real', () => {
    expect(isIsoDate('2026-10-07')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('07/10/2026')).toBe(false);
  });
  it('todaySP usa o fuso de São Paulo', () => {
    // 02:00 UTC de 04/10 ainda é 03/10 em São Paulo (UTC-3)
    expect(todaySP(new Date('2026-10-04T02:00:00Z'))).toBe('2026-10-03');
    expect(toIsoDateSP(new Date('2026-10-04T12:00:00Z'))).toBe('2026-10-04');
  });
  it('formatDateBR, addDays e daysBetween', () => {
    expect(formatDateBR('2026-10-07')).toBe('07/10/2026');
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(daysBetween('2026-10-03', '2026-10-07')).toBe(4);
  });
  it('dueInfo descreve prazo relativo', () => {
    expect(dueInfo(null, '2026-10-03')).toEqual({ label: 'A definir', tone: 'none' });
    expect(dueInfo('2026-10-01', '2026-10-03')).toEqual({ label: 'Vencida há 2 dias', tone: 'overdue' });
    expect(dueInfo('2026-10-02', '2026-10-03')).toEqual({ label: 'Vencida há 1 dia', tone: 'overdue' });
    expect(dueInfo('2026-10-03', '2026-10-03')).toEqual({ label: 'Vence hoje', tone: 'soon' });
    expect(dueInfo('2026-10-05', '2026-10-03')).toEqual({ label: 'Vence em 2 dias', tone: 'soon' });
    expect(dueInfo('2026-10-04', '2026-10-03')).toEqual({ label: 'Vence amanhã', tone: 'soon' });
    expect(dueInfo('2026-10-20', '2026-10-03')).toEqual({ label: 'Vence em 17 dias', tone: 'ok' });
  });
});

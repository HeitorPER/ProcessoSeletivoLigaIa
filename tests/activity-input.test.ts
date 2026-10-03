import { describe, expect, it } from 'vitest';
import { parseFilter } from '@/lib/activities/filters';
import { activityInputSchema, activityPatchSchema, blockedReasonError, normalizeBlocked, toActivityFields, toActivityPatch, zodErrors } from '@/lib/activities/input';

const ENGLISH = /Invalid|expected|Expected|Too (small|big)/;

describe('motivo do bloqueio', () => {
  it('bloqueada sem motivo efetivo gera erro', () => {
    expect(blockedReasonError({ status: 'blocked', blockedReason: 'Sem sala' }, { blockedReason: '' })).toBe('Informe o motivo do bloqueio');
    expect(blockedReasonError({ status: 'blocked', blockedReason: 'Sem sala' }, { blockedReason: null })).toBe('Informe o motivo do bloqueio');
    expect(blockedReasonError({ status: 'todo', blockedReason: null }, { status: 'blocked' })).toBe('Informe o motivo do bloqueio');
    expect(blockedReasonError(null, { status: 'blocked' })).toBe('Informe o motivo do bloqueio');
  });
  it('permite quando há motivo efetivo', () => {
    expect(blockedReasonError({ status: 'todo', blockedReason: null }, { status: 'blocked', blockedReason: 'Sem sala' })).toBeNull();
    expect(blockedReasonError({ status: 'blocked', blockedReason: 'Sem sala' }, { title: 'Outro' })).toBeNull();
    expect(blockedReasonError({ status: 'blocked', blockedReason: 'Sem sala' }, { status: 'done' })).toBeNull();
    expect(blockedReasonError({ status: 'todo', blockedReason: null }, { blockedReason: '' })).toBeNull();
  });
  it('normalizeBlocked limpa o motivo ao sair de bloqueada', () => {
    expect(normalizeBlocked({ status: 'in_progress', blockedReason: 'resto' })).toEqual({ status: 'in_progress', blockedReason: null });
    expect(normalizeBlocked({ status: 'blocked', blockedReason: 'Sem sala' })).toEqual({ status: 'blocked', blockedReason: 'Sem sala' });
    expect(normalizeBlocked({ title: 'x' })).toEqual({ title: 'x' });
  });
});

describe('mensagens em português', () => {
  it('valor inválido de frente não vaza inglês', () => {
    const r = activityInputSchema.safeParse({ title: 'x', status: 'todo', front: 'Marketing' });
    expect(r.success).toBe(false);
    const msgs = zodErrors(r.error!).join(' ');
    expect(msgs).not.toMatch(ENGLISH);
    expect(msgs.toLowerCase()).toContain('frente');
  });
  it('outros campos e corpo inválido também em português', () => {
    const bad = activityInputSchema.safeParse({ title: 'x', status: 'todo', dueDate: 'amanha', ownerIds: 'U-A', description: 5 });
    expect(zodErrors(bad.error!).join(' ')).not.toMatch(ENGLISH);
    expect(zodErrors(activityPatchSchema.safeParse(null).error!).join(' ')).not.toMatch(ENGLISH);
    expect(zodErrors(activityInputSchema.safeParse({ status: 'todo' }).error!).join(' ')).not.toMatch(ENGLISH);
    expect(zodErrors(activityInputSchema.safeParse({ title: 'x', status: 'todo', reason: 5 }).error!).join(' ')).not.toMatch(ENGLISH);
  });
});

describe('parseFilter', () => {
  it('padrões: abertas, qualquer prazo, todos os responsáveis', () => {
    expect(parseFilter({})).toEqual({ filter: { status: 'open', due: 'all' }, values: { responsavel: '', frente: '', estado: 'open', prazo: 'all' } });
  });
  it('lê valores válidos e ignora inválidos', () => {
    const r = parseFilter({ responsavel: 'U-D', frente: 'Operações', estado: 'blocked', prazo: 'overdue' });
    expect(r.filter).toEqual({ ownerId: 'U-D', front: 'Operações', status: 'blocked', due: 'overdue' });
    expect(parseFilter({ frente: 'Marketing', estado: 'xyz', prazo: 'ontem', responsavel: '<script>' }).filter).toEqual({ status: 'open', due: 'all' });
  });
  it('"minhas" fixa o responsável', () => {
    expect(parseFilter({ responsavel: 'U-D' }, 'U-A').filter.ownerId).toBe('U-A');
  });
});

describe('entrada de atividade', () => {
  it('converte vazios em null e valida título', () => {
    const ok = activityInputSchema.safeParse({ title: ' Nova ', status: 'todo', dueDate: '', front: '', ownerIds: ['U-A'], nextStep: '' });
    expect(ok.success).toBe(true);
    expect(toActivityFields(ok.data!)).toMatchObject({ title: 'Nova', dueDate: null, front: null, nextStep: null, ownerIds: ['U-A'] });
    const bad = activityInputSchema.safeParse({ title: '', status: 'feito' });
    expect(bad.success).toBe(false);
    expect(zodErrors(bad.error!).join(' ')).toContain('título');
  });
  it('patch aceita só os campos enviados', () => {
    const p = activityPatchSchema.safeParse({ status: 'blocked', blockedReason: 'Sem sala' });
    expect(toActivityPatch(p.data!)).toEqual({ status: 'blocked', blockedReason: 'Sem sala' });
  });
});

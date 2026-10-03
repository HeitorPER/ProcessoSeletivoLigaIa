import { describe, expect, it } from 'vitest';
import { parseFilter } from '@/lib/activities/filters';
import { activityInputSchema, activityPatchSchema, toActivityFields, toActivityPatch, zodErrors } from '@/lib/activities/input';

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

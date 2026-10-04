import { describe, expect, it } from 'vitest';
import { resolvePeriod } from '@/lib/summary/period';

const NOW = new Date('2026-10-03T15:00:00Z');

describe('resolvePeriod', () => {
  it('última visita quando existe', () => {
    const last = new Date('2026-10-02T12:00:00Z');
    const r = resolvePeriod(undefined, NOW, last);
    expect(r).toMatchObject({ period: 'visita', since: last });
    expect(r.label).toContain('desde sua última visita');
  });
  it('sem visita anterior usa 7 dias e explica', () => {
    const r = resolvePeriod('visita', NOW, null);
    expect(r.since.getTime()).toBe(NOW.getTime() - 7 * 86_400_000);
    expect(r.label).toContain('primeira visita');
  });
  it('7d, 30d e valor inválido', () => {
    expect(resolvePeriod('30d', NOW, null).since.getTime()).toBe(NOW.getTime() - 30 * 86_400_000);
    expect(resolvePeriod('7d', NOW, new Date()).label).toBe('nos últimos 7 dias');
    expect(resolvePeriod('xyz', NOW, null).period).toBe('visita');
  });
});

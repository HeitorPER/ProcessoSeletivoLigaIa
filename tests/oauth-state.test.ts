import { describe, expect, it } from 'vitest';
import { OAUTH_STATE_COOKIE, readCookie, sameState } from '@/lib/google/state';

describe('sameState', () => {
  it('iguais -> true', () => expect(sameState('abc123', 'abc123')).toBe(true));
  it('diferentes, ausentes ou de tamanho diferente -> false', () => {
    expect(sameState('abc123', 'abc124')).toBe(false);
    expect(sameState(undefined, 'abc')).toBe(false);
    expect(sameState('abc', null)).toBe(false);
    expect(sameState('', '')).toBe(false);
    expect(sameState('abc', 'abcd')).toBe(false);
  });
});

describe('readCookie', () => {
  it('ignora cookies com nome parecido e acha o certo entre vários', () => {
    const header = `x_${OAUTH_STATE_COOKIE}=errado; a=1; ${OAUTH_STATE_COOKIE}=certo; b=2`;
    expect(readCookie(header, OAUTH_STATE_COOKIE)).toBe('certo');
    expect(readCookie(`x_${OAUTH_STATE_COOKIE}=errado`, OAUTH_STATE_COOKIE)).toBeUndefined();
  });
  it('primeiro da lista e cabeçalho ausente', () => {
    expect(readCookie(`${OAUTH_STATE_COOKIE}=v1; a=1`, OAUTH_STATE_COOKIE)).toBe('v1');
    expect(readCookie(null, OAUTH_STATE_COOKIE)).toBeUndefined();
  });
});

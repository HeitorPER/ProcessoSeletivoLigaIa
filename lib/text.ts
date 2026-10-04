const STOPWORDS = new Set(['a', 'o', 'as', 'os', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'um', 'uma', 'para', 'por', 'com', 'no', 'na']);

export function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeName(s: string): string {
  return stripAccents(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeForMatch(s: string): string {
  return stripAccents(s)
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, ' ')
    .replace(/[*_`\\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function tokenize(s: string): string[] {
  return normalizeName(s)
    .split(/[^a-z0-9-]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

export function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Igualdade tolerante para textos curtos (títulos, próximos passos). */
export function textSimilar(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  if (normalizeForMatch(a) === normalizeForMatch(b)) return true;
  return jaccard(tokenize(a), tokenize(b)) >= 0.85;
}

export function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

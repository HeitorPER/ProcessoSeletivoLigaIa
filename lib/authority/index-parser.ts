import type { AuthorityConfig, MarkdownDoc } from '@/lib/types';

export function parseIndex(doc: MarkdownDoc): AuthorityConfig {
  let registryFileName: string | null = null;
  let registrySheet: string | null = null;
  const superseded = new Set<string>();

  for (const line of doc.text.split('\n')) {
    if (!registryFileName && /fonte/i.test(line) && /atividade/i.test(line)) {
      const quoted = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim());
      const sheetFile = quoted.find((f) => /\.(xlsx|xls)$/i.test(f)) ?? /([\w .-]+\.xlsx)/i.exec(line)?.[1]?.trim();
      if (sheetFile) {
        registryFileName = sheetFile;
        registrySheet = /aba\s+[`"“]([^`"”]+)[`"”]/i.exec(line)?.[1]?.trim() ?? null;
      }
    }
    for (const m of line.matchAll(/`([^`]+)`\s+(?:foi\s+)?(?:superado|substitu[íi]do|descontinuado)/gi)) {
      superseded.add(m[1].trim());
    }
  }
  return { registryFileName, registrySheet, supersededFileNames: [...superseded] };
}

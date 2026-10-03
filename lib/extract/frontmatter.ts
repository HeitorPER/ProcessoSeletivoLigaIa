// Chaves do acervo são minúsculas (status, atualizado_em, data_da_reuniao...). Exigir minúsculas
// evita confundir frases do corpo como "Corpo: com dois pontos." com metadados.
const KV = /^([a-z_][a-z0-9_-]*):\s*(.*?)\s*$/;

/**
 * Lê metadados no topo do documento. Aceita YAML com `---` e o formato do acervo:
 * título `# ...` seguido de linhas `chave: valor` (com ou sem linhas em branco entre elas).
 */
export function parseFrontMatter(text: string): { data: Record<string, string>; bodyStart: number } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const data: Record<string, string> = {};

  if (lines[0]?.trim() === '---') {
    let i = 1;
    for (; i < lines.length && lines[i].trim() !== '---'; i++) {
      const m = KV.exec(lines[i].trim());
      if (m) data[m[1].toLowerCase()] = m[2];
    }
    return { data, bodyStart: i + 1 };
  }

  let j = 0;
  while (j < lines.length && j < 6 && (lines[j].trim() === '' || /^#\s/.test(lines[j]))) j++;
  let lastKv = -1;
  for (; j < lines.length; j++) {
    const line = lines[j].trim();
    if (line === '') continue;
    const m = KV.exec(line);
    if (!m || /^https?$/i.test(m[1])) break;
    data[m[1].toLowerCase()] = m[2];
    lastKv = j;
  }
  return { data, bodyStart: lastKv >= 0 ? lastKv + 1 : 0 };
}

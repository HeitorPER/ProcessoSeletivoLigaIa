import path from 'node:path';

/** Converte `file:./x.db` em caminho absoluto a partir da raiz do projeto (cwd), para CLI e runtime apontarem ao mesmo arquivo. */
export function resolveDbUrl(raw: string = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'): string {
  if (!raw.startsWith('file:')) return raw;
  const filePath = raw.slice('file:'.length);
  return `file:${path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)}`;
}

/**
 * Arquivos auxiliares do SQLite (WAL, memória compartilhada, journal). Recriar o banco e deixar um `-wal` antigo
 * para trás faz o SQLite reaplicar páginas velhas no banco novo ("database disk image is malformed").
 */
export function sqliteSidecarFiles(url: string = resolveDbUrl()): string[] {
  if (!url.startsWith('file:')) return [];
  const file = url.slice('file:'.length);
  return ['-wal', '-shm', '-journal'].map((suffix) => file + suffix);
}

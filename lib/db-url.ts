import path from 'node:path';

/** Converte `file:./x.db` em caminho absoluto a partir da raiz do projeto (cwd), para CLI e runtime apontarem ao mesmo arquivo. */
export function resolveDbUrl(raw: string = process.env.DATABASE_URL ?? 'file:./prisma/dev.db'): string {
  if (!raw.startsWith('file:')) return raw;
  const filePath = raw.slice('file:'.length);
  return `file:${path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)}`;
}

import 'dotenv/config';
import { existsSync, rmSync } from 'node:fs';
import { sqliteSidecarFiles } from '../lib/db-url';

// Roda antes de `prisma migrate reset`: um -wal/-shm de uma execução anterior corromperia o banco recriado.
for (const file of sqliteSidecarFiles()) {
  if (!existsSync(file)) continue;
  try {
    rmSync(file);
    console.log(`[db:reset] removido ${file}`);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    console.error(`[db:reset] não foi possível remover ${file} (${code}). Pare o "npm run dev" (Ctrl+C) e rode de novo.`);
    process.exit(1);
  }
}

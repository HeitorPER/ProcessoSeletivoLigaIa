import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export default function setup() {
  // Recria o banco de teste descartável do zero. Em vez de `db push --force-reset`
  // (bloqueado pela proteção do Prisma contra agentes de IA), removemos o arquivo
  // de teste e aplicamos o schema num banco novo.
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(path.resolve(process.cwd(), `prisma/test.db${suffix}`), { force: true });
  }
  execSync('npx prisma db push', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: 'file:./prisma/test.db' },
  });
}

import { prisma } from '@/lib/db';
import { seedBase } from './seed-data';

seedBase(prisma)
  .then(() => console.log('Seed concluído: membros fictícios e estado de sincronização.'))
  .finally(() => prisma.$disconnect());

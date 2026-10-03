process.env.DATABASE_URL = 'file:./prisma/test.db';
process.env.TOKEN_ENC_KEY = process.env.TOKEN_ENC_KEY ?? 'chave-de-teste-somente-para-vitest';
process.env.AI_PROVIDER = 'none';

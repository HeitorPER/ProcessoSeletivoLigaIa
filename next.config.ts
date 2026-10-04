import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', '@prisma/adapter-better-sqlite3', 'pdf-parse'],
};

export default nextConfig;

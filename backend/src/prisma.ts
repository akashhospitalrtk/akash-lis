import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { config } from './config.js';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: InstanceType<typeof PrismaClient>;
};

const adapter = new PrismaPg({ connectionString: config.databaseUrl });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['error', 'warn']
});

if (!config.isProduction) globalForPrisma.prisma = prisma;

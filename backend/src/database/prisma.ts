import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { pool } from './pool.js';
import { config } from '../config/env.js';

const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: InstanceType<typeof PrismaClient>;
};

const adapter = new PrismaPg(pool, { disposeExternalPool: false });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: config.isProduction ? ['error'] : ['error', 'warn']
});

if (!config.isProduction) globalForPrisma.prisma = prisma;

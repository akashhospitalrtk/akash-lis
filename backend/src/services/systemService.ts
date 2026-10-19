import { prisma } from '../database/prisma.js';
import { config } from '../config/env.js';
import { AppError } from '../core/AppError.js';

export async function health() {
  try { await prisma.$queryRaw`SELECT 1`; }
  catch { throw new AppError('Database is unavailable.', 503, 'SERVICE_UNAVAILABLE'); }
  return { status: 'ok', database: 'connected' };
}

export function publicConfig() { return { hospital: config.hospital }; }

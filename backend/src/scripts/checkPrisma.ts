import { pool } from '../database/pool.js';
import { prisma } from '../database/prisma.js';

try {
  await prisma.users.findFirst({ select: { id: true } });
  console.log('Prisma can read the LIS database.');
} finally {
  await prisma.$disconnect();
  await pool.end();
}

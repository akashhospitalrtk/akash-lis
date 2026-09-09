import { prisma } from '../prisma.js';

try {
  await prisma.users.findFirst({ select: { id: true } });
  console.log('Prisma can read the LIS database.');
} finally {
  await prisma.$disconnect();
}

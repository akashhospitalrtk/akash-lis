import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { users, Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../database/prisma.js';
import { config } from '../config/env.js';
import { AppError } from '../core/AppError.js';
import type { AccountPayload, LoginInput } from '../schemas/authSchemas.js';

function sessionFor(user: users) {
  const payload = { id: user.id, username: user.username, fullName: user.full_name, role: user.role, designation: user.designation };
  return { token: jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' }), user: payload };
}

function userSummary(user: users) {
  return { id: user.id, username: user.username, full_name: user.full_name, role: user.role, designation: user.designation, signature_label: user.signature_label, active: user.active, created_at: user.created_at };
}

async function accountData(input: AccountPayload) {
  return { username: input.username.toLowerCase(), password_hash: await bcrypt.hash(input.password, 12), full_name: input.fullName, role: input.role, designation: input.designation || null, signature_label: input.signatureLabel || null };
}

export async function setupStatus() { return { initialized: Boolean(await prisma.users.findFirst({ select: { id: true } })) }; }

export async function bootstrap(input: AccountPayload) {
  const data = await accountData({ ...input, role: 'ADMIN' });
  const user = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Serialize first-account checks to prevent concurrent setup requests creating two administrators.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(610011)`;
    if (await tx.users.findFirst({ select: { id: true } })) throw AppError.conflict('The first account has already been created.');
    return tx.users.create({ data });
  });
  return sessionFor(user);
}

export async function login(input: LoginInput) {
  const user = await prisma.users.findFirst({ where: { username: input.username.toLowerCase(), active: true } });
  if (!user || !(await bcrypt.compare(input.password, user.password_hash))) throw AppError.unauthorized('Username or password is incorrect.');
  return sessionFor(user);
}

export async function listUsers() { return (await prisma.users.findMany({ orderBy: { full_name: 'asc' } })).map(userSummary); }
export async function createUser(input: AccountPayload) { return userSummary(await prisma.users.create({ data: await accountData(input) })); }

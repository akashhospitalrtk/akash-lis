import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { user_role, users } from '../../generated/prisma/client.js';
import { config } from '../config.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { prisma } from '../prisma.js';

const accountSchema = z.object({
  username: z.string().trim().min(3).max(60),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(['ADMIN', 'TECHNICIAN', 'AUTHORIZER']),
  designation: z.string().trim().max(120).optional().or(z.literal('')),
  signatureLabel: z.string().trim().max(160).optional().or(z.literal(''))
});

type AccountPayload = z.infer<typeof accountSchema>;

function asUserRole(role: AccountPayload['role']): user_role {
  return role as user_role;
}

function sessionFor(user: users) {
  const payload = {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    designation: user.designation
  };
  return { token: jwt.sign(payload, config.jwtSecret, { expiresIn: '12h' }), user: payload };
}

function userSummary(user: users) {
  return {
    id: user.id,
    username: user.username,
    full_name: user.full_name,
    role: user.role,
    designation: user.designation,
    signature_label: user.signature_label,
    active: user.active,
    created_at: user.created_at
  };
}

export const authRoutes = Router();

authRoutes.get('/setup/status', async (_req, res, next) => {
  try {
    const firstUser = await prisma.users.findFirst({ select: { id: true } });
    res.json({ initialized: Boolean(firstUser) });
  } catch (error) { next(error); }
});

authRoutes.post('/auth/bootstrap', async (req, res, next) => {
  try {
    const payload = accountSchema.parse({ ...req.body, role: 'ADMIN' });
    const existing = await prisma.users.findFirst({ select: { id: true } });
    if (existing) return res.status(409).json({ message: 'The first account has already been created.' });

    const passwordHash = await bcrypt.hash(payload.password, 12);
    const user = await prisma.users.create({
      data: {
        username: payload.username.toLowerCase(),
        password_hash: passwordHash,
        full_name: payload.fullName,
        role: asUserRole(payload.role),
        designation: payload.designation || null,
        signature_label: payload.signatureLabel || null
      }
    });
    return res.status(201).json(sessionFor(user));
  } catch (error) { next(error); }
});

authRoutes.post('/auth/login', async (req, res, next) => {
  try {
    const credentials = z.object({ username: z.string().trim(), password: z.string() }).parse(req.body);
    const user = await prisma.users.findFirst({
      where: { username: credentials.username.toLowerCase(), active: true }
    });
    if (!user || !(await bcrypt.compare(credentials.password, user.password_hash))) {
      return res.status(401).json({ message: 'Username or password is incorrect.' });
    }
    return res.json(sessionFor(user));
  } catch (error) { next(error); }
});

authRoutes.get('/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

authRoutes.get('/users', authenticate, allowRoles('ADMIN'), async (_req, res, next) => {
  try {
    const users = await prisma.users.findMany({ orderBy: { full_name: 'asc' } });
    res.json(users.map(userSummary));
  } catch (error) { next(error); }
});

authRoutes.post('/users', authenticate, allowRoles('ADMIN'), async (req, res, next) => {
  try {
    const payload = accountSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(payload.password, 12);
    const user = await prisma.users.create({
      data: {
        username: payload.username.toLowerCase(),
        password_hash: passwordHash,
        full_name: payload.fullName,
        role: asUserRole(payload.role),
        designation: payload.designation || null,
        signature_label: payload.signatureLabel || null
      }
    });
    res.status(201).json(userSummary(user));
  } catch (error) { next(error); }
});

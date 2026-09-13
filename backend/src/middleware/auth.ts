import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AppError } from '../core/AppError.js';
import { sessionSchema, type SessionUser } from '../schemas/authSchemas.js';

export const authenticate: RequestHandler = (req, _res, next) => {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) { next(AppError.unauthorized()); return; }
  try { req.user = sessionSchema.parse(jwt.verify(token, config.jwtSecret)); }
  catch { next(AppError.unauthorized('Your session has expired. Please sign in again.')); return; }
  next();
};

export function allowRoles(...roles: SessionUser['role'][]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) { next(AppError.forbidden()); return; }
    next();
  };
}

export function requireUser(req: Pick<Request, 'user'>): SessionUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

import type { Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { AppError } from '../core/AppError.js';
import { sessionSchema, type SessionUser } from '../schemas/authSchemas.js';
import { loadSession } from '../services/authService.js';
import { permissionsFor, type Permission } from '../services/permissionService.js';

export const authenticate: RequestHandler = (req, _res, next) => {
  const token = req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) { next(AppError.unauthorized()); return; }
  let claims: SessionUser;
  try { claims = sessionSchema.parse(jwt.verify(token, config.jwtSecret)); }
  catch { next(AppError.unauthorized('Your session has expired. Please sign in again.')); return; }
  void loadSession(claims.id).then((user) => { req.user = user; next(); }).catch(next);
};

export function allowPermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.user || !permissionsFor(req.user.role).includes(permission)) { next(AppError.forbidden()); return; }
    next();
  };
}

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

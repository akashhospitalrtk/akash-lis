import type { RequestHandler } from 'express';

export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.set({ 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
  next();
};

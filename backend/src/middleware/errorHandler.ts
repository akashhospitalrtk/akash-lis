import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../core/AppError.js';

export const notFound: RequestHandler = (_req, _res, next) => next(AppError.notFound('API endpoint not found.'));

export const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, next) => {
  if (res.headersSent) { next(error); return; }
  let failure: AppError;
  if (error instanceof AppError) failure = error;
  else if (error instanceof ZodError) failure = new AppError(error.issues[0]?.message || 'Please check the form.', 400, 'VALIDATION_ERROR', error.issues.map(({ path, message }) => ({ path: path.join('.'), message })));
  else {
    const known = error as { code?: string; type?: string } | null;
    if (known?.code === '23505' || known?.code === 'P2002') failure = AppError.conflict('That record already exists.');
    else if (known?.code === '23503' || known?.code === 'P2003') failure = AppError.conflict('A related record is unavailable or still in use.');
    else if (['57014', '55P03', '53300'].includes(known?.code || '')) failure = new AppError('The database is busy. Please retry in a moment.', 503, 'DATABASE_BUSY');
    else if (known?.type === 'entity.parse.failed') failure = new AppError('The request body must be valid JSON.', 400, 'INVALID_JSON');
    else if (known?.type === 'entity.too.large') failure = new AppError('The request body is too large.', 413, 'PAYLOAD_TOO_LARGE');
    else {
      // Do not return SQL, credentials, stack traces or unexpected exception text.
      console.error('Unexpected API error', error instanceof Error ? error.name : 'UnknownError', known?.code || '');
      failure = new AppError('An unexpected error occurred. Please try again.', 500, 'INTERNAL_ERROR');
    }
  }
  res.status(failure.statusCode).json({ success: false, message: failure.message, code: failure.code, ...(failure.details === undefined ? {} : { details: failure.details }) });
};

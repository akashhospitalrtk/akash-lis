import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';

export function validate(schema: ZodTypeAny, source: 'body' | 'query' = 'body'): RequestHandler {
  return (req, res, next) => {
    try { res.locals.input = schema.parse(req[source]); next(); }
    catch (error) { next(error); }
  };
}

export function validateParams(schema: ZodTypeAny): RequestHandler {
  return (req, _res, next) => {
    try { schema.parse(req.params); next(); }
    catch (error) { next(error); }
  };
}

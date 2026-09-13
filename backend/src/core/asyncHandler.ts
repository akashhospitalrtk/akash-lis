import type { RequestHandler } from 'express';

export type Controller<Input = undefined> = RequestHandler<Record<string, string>, unknown, unknown, Record<string, unknown>, { input: Input }>;

// Express 4 does not automatically forward rejected promises to error middleware.
export function asyncHandler<Input = undefined>(handler: Controller<Input>): Controller<Input> {
  return (req, res, next) => { Promise.resolve().then(() => handler(req, res, next)).catch(next); };
}

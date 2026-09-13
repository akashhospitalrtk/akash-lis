import type { SessionUser } from '../schemas/authSchemas.js';
declare global {
  namespace Express {
    interface Request { user?: SessionUser; }
  }
}
export {};

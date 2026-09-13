import { Router } from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { accountSchema, bootstrapSchema, loginSchema } from '../schemas/authSchemas.js';
import * as controller from '../controllers/authController.js';

export const authRoutes = Router();
authRoutes.get('/setup/status', controller.setupStatus);
authRoutes.post('/auth/bootstrap', validate(bootstrapSchema), controller.bootstrap);
authRoutes.post('/auth/login', validate(loginSchema), controller.login);
authRoutes.get('/auth/me', authenticate, controller.me);
authRoutes.get('/users', authenticate, allowRoles('ADMIN'), controller.listUsers);
authRoutes.post('/users', authenticate, allowRoles('ADMIN'), validate(accountSchema), controller.createUser);

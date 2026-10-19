import { Router } from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate, validateParams } from '../middleware/validate.js';
import { idParamsSchema } from '../schemas/commonSchemas.js';
import { accountSchema, bootstrapSchema, loginSchema, updateAccountSchema, departmentSchema } from '../schemas/authSchemas.js';
import * as controller from '../controllers/authController.js';

export const authRoutes = Router();
authRoutes.get('/setup/status', controller.setupStatus);
authRoutes.post('/auth/bootstrap', validate(bootstrapSchema), controller.bootstrap);
authRoutes.post('/auth/login', validate(loginSchema), controller.login);
authRoutes.get('/auth/me', authenticate, controller.me);
authRoutes.get('/users', authenticate, allowRoles('ADMIN', 'IT'), controller.listUsers);
authRoutes.post('/users', authenticate, allowRoles('ADMIN', 'IT'), validate(accountSchema), controller.createUser);
authRoutes.put('/users/:id', authenticate, allowRoles('ADMIN', 'IT'), validateParams(idParamsSchema), validate(updateAccountSchema), controller.updateUser);
authRoutes.get('/departments', authenticate, allowRoles('ADMIN', 'IT'), controller.listDepartments);
authRoutes.post('/departments', authenticate, allowRoles('ADMIN', 'IT'), validate(departmentSchema), controller.createDepartment);

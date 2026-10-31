import { Router } from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dashboardQuerySchema } from '../schemas/analyticsSchemas.js';
import * as controller from '../controllers/analyticsController.js';

export const analyticsRoutes = Router();
analyticsRoutes.get('/analytics/dashboard', authenticate, allowRoles('ADMIN', 'TECHNICIAN', 'AUTHORIZER'), validate(dashboardQuerySchema, 'query'), controller.dashboard);

import { Router } from 'express';
import * as controller from '../controllers/systemController.js';
import * as reportTemplate from '../controllers/reportTemplateController.js';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { saveReportTemplateSchema } from '../schemas/reportTemplateSchema.js';

export const systemRoutes = Router();
systemRoutes.get('/health', controller.health);
systemRoutes.get('/config', controller.publicConfig);
systemRoutes.get('/report-template', authenticate, reportTemplate.get);
systemRoutes.put('/report-template', authenticate, allowRoles('ADMIN'), validate(saveReportTemplateSchema), reportTemplate.save);

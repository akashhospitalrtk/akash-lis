import { Router } from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate, validateParams } from '../middleware/validate.js';
import { idParamsSchema } from '../schemas/commonSchemas.js';
import { profileSchema, profileInputSchema } from '../schemas/profileSchemas.js';
import * as controller from '../controllers/profileController.js';

export const profileRoutes = Router();
profileRoutes.get('/catalogue/descriptions', authenticate, allowRoles('ADMIN'), controller.descriptions);
profileRoutes.get('/profiles', authenticate, controller.activeProfiles);
profileRoutes.get('/catalogue/profiles', authenticate, allowRoles('ADMIN'), controller.catalogueProfiles);
profileRoutes.get('/catalogue/profiles/:id/audit', authenticate, allowRoles('ADMIN'), validateParams(idParamsSchema), controller.profileAudit);
profileRoutes.post('/catalogue/profiles', authenticate, allowRoles('ADMIN'), validate(profileSchema), controller.createProfile);
profileRoutes.put('/catalogue/profiles/:id', authenticate, allowRoles('ADMIN'), validateParams(idParamsSchema), validate(profileInputSchema), controller.updateProfile);
profileRoutes.delete('/catalogue/profiles/:id', authenticate, allowRoles('ADMIN'), validateParams(idParamsSchema), controller.archiveProfile);
profileRoutes.post('/catalogue/profiles/:id/restore', authenticate, allowRoles('ADMIN'), validateParams(idParamsSchema), controller.restoreProfile);

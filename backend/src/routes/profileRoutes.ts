import { Router } from 'express';
import { authenticate, allowPermission, allowRoles } from '../middleware/auth.js';
import { validate, validateParams } from '../middleware/validate.js';
import { idParamsSchema } from '../schemas/commonSchemas.js';
import { permanentDeleteProfileSchema, profileSchema, profileInputSchema } from '../schemas/profileSchemas.js';
import * as controller from '../controllers/profileController.js';

export const profileRoutes = Router();
profileRoutes.get('/catalogue/descriptions', authenticate, allowPermission('catalogue.manage'), controller.descriptions);
profileRoutes.get('/profiles', authenticate, allowRoles('ADMIN', 'TECHNICIAN', 'AUTHORIZER'), controller.activeProfiles);
profileRoutes.get('/catalogue/profiles', authenticate, allowPermission('catalogue.manage'), controller.catalogueProfiles);
profileRoutes.get('/catalogue/profiles/:id/audit', authenticate, allowPermission('catalogue.manage'), validateParams(idParamsSchema), controller.profileAudit);
profileRoutes.post('/catalogue/profiles', authenticate, allowPermission('catalogue.manage'), validate(profileSchema), controller.createProfile);
profileRoutes.put('/catalogue/profiles/:id', authenticate, allowPermission('catalogue.manage'), validateParams(idParamsSchema), validate(profileInputSchema), controller.updateProfile);
profileRoutes.delete('/catalogue/profiles/:id', authenticate, allowPermission('catalogue.manage'), validateParams(idParamsSchema), controller.archiveProfile);
profileRoutes.post('/catalogue/profiles/:id/restore', authenticate, allowPermission('catalogue.manage'), validateParams(idParamsSchema), controller.restoreProfile);
profileRoutes.delete('/catalogue/profiles/:id/permanent', authenticate, allowPermission('catalogue.delete'), validateParams(idParamsSchema), validate(permanentDeleteProfileSchema), controller.permanentlyDeleteProfile);

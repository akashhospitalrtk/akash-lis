import { Router } from 'express';
import { authenticate, allowRoles } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { externalPatientSearchSchema } from '../schemas/patientSchemas.js';
import { searchExternalPatients } from '../controllers/patientController.js';

export const patientRoutes = Router();
patientRoutes.get('/external-patients', authenticate, allowRoles('ADMIN', 'TECHNICIAN'), validate(externalPatientSearchSchema, 'query'), searchExternalPatients);

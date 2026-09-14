import { Router } from 'express';
import { authenticate, allowPermission } from '../middleware/auth.js';
import { validate, validateParams } from '../middleware/validate.js';
import { idParamsSchema } from '../schemas/commonSchemas.js';
import { clinicalSearchSchema, clinicalNoteSchema } from '../schemas/clinicalSchemas.js';
import * as controller from '../controllers/clinicalController.js';

export const clinicalRoutes = Router();
clinicalRoutes.use('/clinical', authenticate, (_req, res, next) => { res.set('Cache-Control', 'private, no-store'); next(); });
clinicalRoutes.get('/clinical/orders', allowPermission('patient.view'), allowPermission('status.view'), validate(clinicalSearchSchema, 'query'), controller.listOrders);
clinicalRoutes.get('/clinical/orders/:id', allowPermission('patient.view'), validateParams(idParamsSchema), controller.getOrder);
clinicalRoutes.get('/clinical/orders/:id/results', allowPermission('result.view'), validateParams(idParamsSchema), controller.results);
clinicalRoutes.post('/clinical/orders/:id/print', allowPermission('report.print'), validateParams(idParamsSchema), controller.printReport);
clinicalRoutes.get('/clinical/orders/:id/report.pdf', allowPermission('report.download'), validateParams(idParamsSchema), controller.downloadReport);
clinicalRoutes.post('/clinical/orders/:id/notes', allowPermission('clinical_notes.write'), validateParams(idParamsSchema), validate(clinicalNoteSchema), controller.addNote);

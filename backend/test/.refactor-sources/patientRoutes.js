import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { findExternalPatients } from '../services/externalPatientService.js';

export const patientRoutes = Router();

patientRoutes.get('/external-patients', authenticate, async (req, res, next) => {
  try {
    const query = String(req.query.query || '').trim();
    if (query.length < 2) return res.status(400).json({ message: 'Enter at least two characters to search.' });
    return res.json(await findExternalPatients(query));
  } catch (error) { next(error); }
});

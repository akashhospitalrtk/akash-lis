import { ApiResponse } from '../core/ApiResponse.js';
import { asyncHandler } from '../core/asyncHandler.js';
import { findExternalPatients } from '../services/externalPatientService.js';
import type { ExternalPatientSearchInput } from '../schemas/patientSchemas.js';

export const searchExternalPatients = asyncHandler<ExternalPatientSearchInput>(async (_req, res) => {
  ApiResponse.ok(await findExternalPatients(res.locals.input.query)).send(res);
});

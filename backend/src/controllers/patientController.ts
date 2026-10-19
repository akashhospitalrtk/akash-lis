import { ApiResponse } from '../core/ApiResponse.js';
import { asyncHandler } from '../core/asyncHandler.js';
import { findExternalPatients } from '../services/externalPatientService.js';
import type { ExternalPatientSearchInput } from '../schemas/patientSchemas.js';

export const searchExternalPatients = asyncHandler<ExternalPatientSearchInput>(async (_req, res) => {
  const { query, limit, match } = res.locals.input;
  ApiResponse.ok(await findExternalPatients(query, { limit, match })).send(res);
});

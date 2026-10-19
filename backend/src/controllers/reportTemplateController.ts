import { ApiResponse } from '../core/ApiResponse.js';
import { asyncHandler } from '../core/asyncHandler.js';
import { requireUser } from '../middleware/auth.js';
import * as service from '../services/reportTemplateService.js';

export const get = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'private, no-store');
  ApiResponse.ok(await service.getReportTemplate()).send(res);
});
export const save = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.saveReportTemplate(res.locals.input, requireUser(req))).send(res);
});

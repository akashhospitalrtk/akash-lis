import { ApiResponse } from '../core/ApiResponse.js';
import { asyncHandler } from '../core/asyncHandler.js';
import { requireUser } from '../middleware/auth.js';
import type { ClinicalSearchInput, ClinicalNoteInput } from '../schemas/clinicalSchemas.js';
import * as service from '../services/clinicalService.js';

export const listOrders = asyncHandler<ClinicalSearchInput>(async (_req, res) => { ApiResponse.ok(await service.listClinicalOrders(res.locals.input)).send(res); });
export const getOrder = asyncHandler(async (req, res) => { ApiResponse.ok(await service.clinicalOrder(req.params.id, requireUser(req))).send(res); });
export const results = asyncHandler(async (req, res) => { ApiResponse.ok(await service.publishedReport(req.params.id, requireUser(req))).send(res); });
export const printReport = asyncHandler(async (req, res) => { ApiResponse.ok(await service.publishedReport(req.params.id, requireUser(req), 'REPORT_PRINT_REQUESTED')).send(res); });
export const addNote = asyncHandler<ClinicalNoteInput>(async (req, res) => { ApiResponse.created(await service.addClinicalNote(req.params.id, res.locals.input, requireUser(req))).send(res); });
export const downloadReport = asyncHandler(async (req, res) => {
  const report = await service.downloadReport(req.params.id, requireUser(req));
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${report.filename}"`, 'Cache-Control': 'private, no-store' });
  res.send(report.bytes);
});

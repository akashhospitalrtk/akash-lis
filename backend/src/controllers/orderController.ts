import { ApiResponse } from '../core/ApiResponse.js';
import { asyncHandler } from '../core/asyncHandler.js';
import { requireUser } from '../middleware/auth.js';
import * as service from '../services/orderWorkflowService.js';
import type { SearchInput } from '../schemas/commonSchemas.js';
import type { CreateOrderInput, SaveResultsInput, AmendmentInput, OrderIdsInput, RecordsExportInput, CsvImportInput, ChangeTestsInput, WorklistInput } from '../schemas/orderSchemas.js';

export const exportRecords = asyncHandler<RecordsExportInput>(async (req, res) => {
  ApiResponse.csv(res, await service.exportRecords(res.locals.input, requireUser(req)));
});

export const listWorklist = asyncHandler<WorklistInput>(async (req, res) => {
  ApiResponse.ok(await service.listWorklist(res.locals.input)).send(res);
});

export const patientHistory = asyncHandler<SearchInput>(async (req, res) => {
  ApiResponse.ok(await service.patientHistory(res.locals.input)).send(res);
});

export const acceptSamples = asyncHandler<OrderIdsInput>(async (req, res) => {
  ApiResponse.ok(await service.acceptSamples(res.locals.input, requireUser(req))).send(res);
});

export const createOrder = asyncHandler<CreateOrderInput>(async (req, res) => {
  ApiResponse.created(await service.createOrder(res.locals.input, requireUser(req))).send(res);
});

export const getOrder = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.getOrder(req.params.id)).send(res);
});

export const saveResults = asyncHandler<SaveResultsInput>(async (req, res) => {
  ApiResponse.ok(await service.saveResults(res.locals.input, req.params.id, requireUser(req))).send(res);
});

export const startProcessing = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.startProcessing(req.params.id, requireUser(req))).send(res);
});

export const importCsv = asyncHandler<CsvImportInput>(async (req, res) => {
  ApiResponse.ok(await service.importCsv(res.locals.input, req.params.id, requireUser(req))).send(res);
});

export const amendReport = asyncHandler<AmendmentInput>(async (req, res) => {
  ApiResponse.ok(await service.amendReport(res.locals.input, req.params.id, requireUser(req))).send(res);
});

export const authorizeReport = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.authorizeReport(req.params.id, requireUser(req))).send(res);
});

export const deliverReport = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.deliverReport(req.params.id, requireUser(req))).send(res);
});

export const markPrinted = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.markPrinted(req.params.id, requireUser(req))).send(res);
});

export const changeTests = asyncHandler<ChangeTestsInput>(async (req, res) => {
  ApiResponse.ok(await service.changeTests(res.locals.input, req.params.id, requireUser(req))).send(res);
});

export const refreshOrderReferences = asyncHandler<AmendmentInput>(async (req, res) => {
  ApiResponse.ok(await service.refreshOrderReferences(res.locals.input, req.params.id, requireUser(req))).send(res);
});

export const removeReport = asyncHandler<AmendmentInput>(async (req, res) => {
  await service.removeReport(res.locals.input, req.params.id, requireUser(req));
  ApiResponse.noContent(res);
});

export const prepareEntry = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.prepareEntry(req.params.id, requireUser(req))).send(res);
});

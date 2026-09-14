import { ApiResponse } from '../core/ApiResponse.js';
import { asyncHandler } from '../core/asyncHandler.js';
import { requireUser } from '../middleware/auth.js';
import * as service from '../services/authService.js';
import type { AccountPayload, LoginInput, UpdateAccountInput, DepartmentInput } from '../schemas/authSchemas.js';

export const setupStatus = asyncHandler(async (_req, res) => { ApiResponse.ok(await service.setupStatus()).send(res); });
export const bootstrap = asyncHandler<AccountPayload>(async (_req, res) => { ApiResponse.created(await service.bootstrap(res.locals.input)).send(res); });
export const login = asyncHandler<LoginInput>(async (_req, res) => { ApiResponse.ok(await service.login(res.locals.input)).send(res); });
export const me = asyncHandler((req, res) => { ApiResponse.ok({ user: requireUser(req) }).send(res); });
export const listUsers = asyncHandler(async (_req, res) => { ApiResponse.ok(await service.listUsers()).send(res); });
export const createUser = asyncHandler<AccountPayload>(async (req, res) => { ApiResponse.created(await service.createUser(res.locals.input, requireUser(req))).send(res); });
export const updateUser = asyncHandler<UpdateAccountInput>(async (req, res) => { ApiResponse.ok(await service.updateUser(req.params.id, res.locals.input, requireUser(req))).send(res); });
export const listDepartments = asyncHandler(async (_req, res) => { ApiResponse.ok(await service.listDepartments()).send(res); });
export const createDepartment = asyncHandler<DepartmentInput>(async (req, res) => { ApiResponse.created(await service.createDepartment(res.locals.input, requireUser(req))).send(res); });

import { ApiResponse } from '../core/ApiResponse.js';
import { asyncHandler } from '../core/asyncHandler.js';
import { requireUser } from '../middleware/auth.js';
import * as service from '../services/profileService.js';
import type { PermanentDeleteProfileInput, ProfileInput } from '../schemas/profileSchemas.js';

export const descriptions = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.descriptions()).send(res);
});

export const activeProfiles = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.activeProfiles()).send(res);
});

export const catalogueProfiles = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.catalogueProfiles()).send(res);
});

export const profileAudit = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.profileAudit(req.params.id)).send(res);
});

export const createProfile = asyncHandler<ProfileInput>(async (req, res) => {
  ApiResponse.created(await service.createProfile(res.locals.input, requireUser(req).id)).send(res);
});

export const updateProfile = asyncHandler<ProfileInput>(async (req, res) => {
  ApiResponse.ok(await service.updateProfile(res.locals.input, req.params.id, requireUser(req).id)).send(res);
});

export const archiveProfile = asyncHandler(async (req, res) => {
  await service.archiveProfile(req.params.id, requireUser(req).id);
  ApiResponse.noContent(res);
});

export const restoreProfile = asyncHandler(async (req, res) => {
  ApiResponse.ok(await service.restoreProfile(req.params.id, requireUser(req).id)).send(res);
});

export const permanentlyDeleteProfile = asyncHandler<PermanentDeleteProfileInput>(async (req, res) => {
  await service.permanentlyDeleteProfile(res.locals.input, req.params.id, requireUser(req).id);
  ApiResponse.noContent(res);
});

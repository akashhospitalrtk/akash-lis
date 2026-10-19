import { ApiResponse } from '../core/ApiResponse.js';
import { asyncHandler } from '../core/asyncHandler.js';
import * as service from '../services/systemService.js';

export const health = asyncHandler(async (_req, res) => { ApiResponse.ok(await service.health()).send(res); });
export const publicConfig = asyncHandler((_req, res) => { ApiResponse.ok(service.publicConfig()).send(res); });

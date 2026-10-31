import { ApiResponse } from '../core/ApiResponse.js';
import { asyncHandler } from '../core/asyncHandler.js';
import type { DashboardQuery } from '../schemas/analyticsSchemas.js';
import * as service from '../services/analyticsService.js';

export const dashboard = asyncHandler<DashboardQuery>(async (req, res) => {
  ApiResponse.ok(await service.dashboardAnalytics(res.locals.input)).send(res);
});

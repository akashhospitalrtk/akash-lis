import { Router } from 'express';
import * as controller from '../controllers/systemController.js';

export const systemRoutes = Router();
systemRoutes.get('/health', controller.health);
systemRoutes.get('/config', controller.publicConfig);

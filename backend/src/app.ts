import express from 'express';
import { outsideLabRoutes } from './routes/outsideLabRoutes.js';
import cors from 'cors';
import { config } from './config/env.js';
import { authRoutes } from './routes/authRoutes.js';
import { profileRoutes } from './routes/profileRoutes.js';
import { patientRoutes } from './routes/patientRoutes.js';
import { orderRoutes } from './routes/orderRoutes.js';
import { systemRoutes } from './routes/systemRoutes.js';
import { clinicalRoutes } from './routes/clinicalRoutes.js';
import { analyticsRoutes } from './routes/analyticsRoutes.js';
import { securityHeaders } from './middleware/securityHeaders.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors(config.allowedOrigins.length ? { origin: config.allowedOrigins, exposedHeaders: ['Content-Disposition', 'X-Export-Row-Count'] } : config.isProduction ? { origin: false } : { exposedHeaders: ['Content-Disposition', 'X-Export-Row-Count'] }));
  app.use(securityHeaders);
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', systemRoutes, authRoutes, profileRoutes, patientRoutes, outsideLabRoutes, orderRoutes, clinicalRoutes, analyticsRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

// Vercel imports this app without starting a listener or running migrations.
export default createApp();

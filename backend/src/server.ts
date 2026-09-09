import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { config } from './config.js';
import { authRoutes } from './routes/authRoutes.js';
import { profileRoutes } from './routes/profileRoutes.js';
import { patientRoutes } from './routes/patientRoutes.js';
import { orderRoutes } from './routes/orderRoutes.js';
import { prisma } from './prisma.js';

type KnownError = {
  code?: string;
  status?: number;
  message?: string;
};

const app = express();
app.disable('x-powered-by');
app.use(cors(config.allowedOrigins.length ? { origin: config.allowedOrigins, exposedHeaders: ['Content-Disposition', 'X-Export-Row-Count'] } : config.isProduction ? { origin: false } : { exposedHeaders: ['Content-Disposition', 'X-Export-Row-Count'] }));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'connected' });
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'disconnected' });
  }
});
app.get('/api/config', (_req, res) => res.json({ hospital: config.hospital }));
app.use('/api', authRoutes);
app.use('/api', profileRoutes);
app.use('/api', patientRoutes);
app.use('/api', orderRoutes);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error instanceof ZodError) return res.status(400).json({ message: error.issues[0]?.message || 'Please check the form.' });
  const knownError = error as KnownError;
  if (knownError.code === '23505' || knownError.code === 'P2002') return res.status(409).json({ message: 'That record already exists.' });
  return res.status(knownError.status || 500).json({ message: knownError.message || 'Something went wrong.' });
});

const server = app.listen(config.port, () => console.log(`LIS API listening on port ${config.port}`));

function stopServer() {
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.once('SIGTERM', stopServer);
process.once('SIGINT', stopServer);

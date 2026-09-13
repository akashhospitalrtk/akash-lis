import { createApp } from './app.js';
import { config } from './config/env.js';
import { pool } from './database/pool.js';
import { prisma } from './database/prisma.js';

const server = createApp().listen(config.port, () => console.log(`LIS API listening on port ${config.port}`));
let stopping = false;
function stopServer() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    void prisma.$disconnect().then(() => pool.end()).then(() => process.exit(0)).catch(() => process.exit(1));
  });
}
process.once('SIGTERM', stopServer);
process.once('SIGINT', stopServer);

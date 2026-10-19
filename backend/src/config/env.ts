import './loadEnv.js';
import { envSchema } from '../schemas/envSchema.js';

const env = envSchema.parse(process.env);
const isProduction = env.NODE_ENV === 'production';

export const config = {
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  jwtSecret: env.JWT_SECRET,
  isProduction,
  allowedOrigins: (env.CORS_ORIGIN || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  databaseSsl: env.DATABASE_SSL === 'true',
  databasePoolMax: env.DATABASE_POOL_MAX,
  databaseStatementTimeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
  databaseLockTimeout: env.DATABASE_LOCK_TIMEOUT_MS,
  hospital: {
    name: env.HOSPITAL_NAME,
    address: env.HOSPITAL_ADDRESS || '',
    phone: env.HOSPITAL_PHONE || ''
  },
  externalPatients: {
    provider: env.HOSPITAL_PATIENT_PROVIDER,
    url: env.HOSPITAL_PATIENT_API_URL || '',
    token: env.HOSPITAL_PATIENT_API_TOKEN || '',
    sqlServer: {
      server: env.HMS_SQL_SERVER,
      port: env.HMS_SQL_PORT,
      requestTimeout: env.HMS_SQL_REQUEST_TIMEOUT_MS,
      database: env.HMS_SQL_DATABASE,
      user: env.HMS_SQL_USER,
      password: env.HMS_SQL_PASSWORD,
      view: env.HMS_SQL_PATIENT_VIEW,
      encrypt: env.HMS_SQL_ENCRYPT === 'true',
      trustServerCertificate: env.HMS_SQL_TRUST_SERVER_CERTIFICATE === 'true'
    }
  }
};

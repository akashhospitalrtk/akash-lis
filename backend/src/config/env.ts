import 'dotenv/config';
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
  hospital: {
    name: env.HOSPITAL_NAME,
    address: env.HOSPITAL_ADDRESS || '',
    phone: env.HOSPITAL_PHONE || ''
  },
  externalPatients: {
    url: env.HOSPITAL_PATIENT_API_URL || '',
    token: env.HOSPITAL_PATIENT_API_TOKEN || ''
  }
};

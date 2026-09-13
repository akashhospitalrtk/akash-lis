import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1).default('postgresql://lis:lis_dev_password@localhost:5432/lis'),
  JWT_SECRET: z.string().min(1).default('development-only-secret'),
  CORS_ORIGIN: z.string().optional(),
  DATABASE_SSL: z.enum(['true', 'false']).default('false'),
  HOSPITAL_NAME: z.string().default('Akash Diagnostic Center'),
  HOSPITAL_ADDRESS: z.string().default('Bhiwani Chungi, Bhiwani Road, Rohtak 124001, Haryana'),
  HOSPITAL_PHONE: z.string().default('7206620626'),
  HOSPITAL_PATIENT_API_URL: z.string().optional(),
  HOSPITAL_PATIENT_API_TOKEN: z.string().optional()
}).superRefine((env, context) => {
  if (env.NODE_ENV === 'production' && (env.JWT_SECRET.length < 32 || /replace-with|development/i.test(env.JWT_SECRET))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_SECRET'], message: 'Set JWT_SECRET to a unique random value of at least 32 characters before running the LIS in production.' });
  }
});


import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

function emptyIfPlaceholder(value) {
  if (typeof value !== 'string') {
    return value;
  }

  if (
    value.includes('PUT_YOUR_') ||
    value.includes('TEMP_SET_LATER') ||
    value.trim() === ''
  ) {
    return undefined;
  }

  return value;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_PATH: z.string().default('./storage/cold-calling.sqlite'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    ),
  PUBLIC_BASE_URL: z.preprocess(emptyIfPlaceholder, z.string().url().optional()),
  TWILIO_ACCOUNT_SID: z.string().min(1, 'TWILIO_ACCOUNT_SID is required'),
  TWILIO_AUTH_TOKEN: z.string().min(1, 'TWILIO_AUTH_TOKEN is required'),
  TWILIO_PHONE_NUMBER: z.string().min(1, 'TWILIO_PHONE_NUMBER is required'),
  TWILIO_TWIML_APP_SID: z.string().min(1, 'TWILIO_TWIML_APP_SID is required'),
  TWILIO_API_KEY: z.string().min(1, 'TWILIO_API_KEY is required'),
  TWILIO_API_SECRET: z.string().min(1, 'TWILIO_API_SECRET is required'),
  // Auth + invites
  JWT_SECRET: z.string().min(16).default('dev-secret-change-me-change-me-change-me'),
  JWT_TTL_SECONDS: z.coerce.number().default(60 * 60 * 8), // 8 hours
  INVITE_BASE_URL: z.preprocess(emptyIfPlaceholder, z.string().url().optional()),
  ADMIN_EMAIL: z.string().email().optional(),
  // SMTP (optional — when missing invite email is logged to console)
  SMTP_HOST: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SMTP_PASS: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SMTP_FROM: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SMTP_SECURE: z
    .preprocess((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : v), z.boolean().optional())
    .optional(),
  // Jento Mailer Gmail pool — reuse an existing active Gmail + app_password
  // to send invite emails (same pattern as jento-mailer/app.py).
  MAILER_DB_PATH: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  MAILER_SENDER_EMAIL: z.preprocess(emptyIfPlaceholder, z.string().email().optional()),
  MAILER_FROM_NAME: z.preprocess(emptyIfPlaceholder, z.string().optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

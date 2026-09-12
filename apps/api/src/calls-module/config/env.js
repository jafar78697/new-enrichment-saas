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
  DATABASE_PATH: z.preprocess(emptyIfPlaceholder, z.string().default('./storage/cold-calling.sqlite')),
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
  // Twilio vars are optional here — when unset the calls module boots in
  // "disabled" mode and routes that need Twilio return 503 instead of crashing.
  TWILIO_ACCOUNT_SID: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_AUTH_TOKEN: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_PHONE_NUMBER: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_TWIML_APP_SID: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_API_KEY: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_API_SECRET: z.preprocess(emptyIfPlaceholder, z.string().optional()),
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
  SCRAPER_API_KEY: z.string().default('jento-scraper-secret-key-123'),
  // SignalWire credentials
  SIGNALWIRE_PROJECT_ID: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SIGNALWIRE_API_TOKEN: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SIGNALWIRE_SPACE_URL: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SIGNALWIRE_PHONE_NUMBER: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  // Relay browser JWTs are not Subscriber Access Tokens. Keep their resource
  // fixed so the app never creates a random Relay endpoint per token request.
  SIGNALWIRE_RELAY_RESOURCE: z.string().regex(/^[A-Za-z0-9_-]+$/).default('jento-manual-browser'),
  SIGNALWIRE_RELAY_TOKEN_MINUTES: z.coerce.number().int().min(5).max(15).default(15),
  MANUAL_CALL_MAX_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

// Calls module is "enabled" only when the core SignalWire voice creds are present.
// Routes that hit SignalWire check this flag and return 503 when false.
export const CALLS_ENABLED = Boolean(
  env.SIGNALWIRE_PROJECT_ID &&
  env.SIGNALWIRE_API_TOKEN &&
  env.SIGNALWIRE_SPACE_URL
);

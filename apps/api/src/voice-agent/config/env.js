import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

function emptyIfPlaceholder(value) {
  if (typeof value !== 'string') return value;
  if (value.includes('PUT_YOUR_') || value.includes('TEMP_SET_LATER') || value.trim() === '') {
    return undefined;
  }
  return value;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  PUBLIC_BASE_URL: z.preprocess(emptyIfPlaceholder, z.string().url().optional()),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform((v) =>
      v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [],
    ),

  // Twilio (shared with calls-module)
  TWILIO_ACCOUNT_SID: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_AUTH_TOKEN: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_PHONE_NUMBER: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_TWIML_APP_SID: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_API_KEY: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  TWILIO_API_SECRET: z.preprocess(emptyIfPlaceholder, z.string().optional()),

  // Google Cloud
  GOOGLE_APPLICATION_CREDENTIALS: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  VERTEX_AI_PROJECT: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  VERTEX_AI_LOCATION: z.preprocess(emptyIfPlaceholder, z.string().default('us-central1')),
  DEEPSEEK_API_KEY: z.preprocess(emptyIfPlaceholder, z.string().optional()),

  // LLMs / API Keys
  OPENAI_API_KEY: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  OPENAI_REALTIME_MODEL: z.string().default('gpt-realtime-mini'),
  OPENAI_ANALYSIS_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_TRANSCRIPTION_MODEL: z.string().default('gpt-4o-mini-transcribe'),
  OPENAI_REALTIME_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(64).max(4096).default(160),
  ELEVENLABS_API_KEY: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  ELEVENLABS_VOICE_ID: z.string().default('f0ign4OCWcX0pECFZyU2'),

  // N8N
  N8N_WEBHOOK_URL: z.preprocess(emptyIfPlaceholder, z.string().optional()),

  // Redis
  REDIS_URL: z.preprocess(emptyIfPlaceholder, z.string().default('redis://localhost:6379')),

  // Voice Agent Settings
  VOICE_AGENT_ENABLED: z
    .preprocess((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : v), z.boolean().default(false)),
  VOICE_SILENCE_TIMEOUT_MS: z.coerce.number().default(3000),
  VOICE_BARGE_IN_CONFIDENCE: z.coerce.number().default(0.5),
  VOICE_MAX_CONVERSATION_TURNS: z.coerce.number().default(50),

  // Auth
  JWT_SECRET: z.string().min(16).default('dev-secret-change-me-change-me-change-me'),

  // Database
  DATABASE_PATH: z.preprocess(emptyIfPlaceholder, z.string().default('./storage/voice-agent.sqlite')),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[voice-agent] Invalid environment variables', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

// Voice agent is forcefully enabled for testing
export const VOICE_AGENT_ENABLED = true;

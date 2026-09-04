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

  // SignalWire
  SIGNALWIRE_PROJECT_ID: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SIGNALWIRE_API_TOKEN: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SIGNALWIRE_SPACE_URL: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  SIGNALWIRE_PHONE_NUMBER: z.preprocess(emptyIfPlaceholder, z.string().optional()),

  // Deepgram owns STT, LLM orchestration, TTS, and turn taking for this module.
  // The older Google/OpenAI/ElevenLabs variables may remain in the deployment
  // environment, but no active Deepgram voice-agent path reads them.
  DEEPGRAM_API_KEY: z.preprocess(emptyIfPlaceholder, z.string().optional()),
  DEEPGRAM_AGENT_MODEL: z.preprocess(emptyIfPlaceholder, z.string().default('gpt-4o-mini')),
  DEEPGRAM_AGENT_LISTEN_MODEL: z.preprocess(emptyIfPlaceholder, z.string().default('flux-general-en')),
  DEEPGRAM_AGENT_EOT_THRESHOLD: z.coerce.number().min(0.5).max(0.9).default(0.75),
  DEEPGRAM_AGENT_EAGER_EOT_THRESHOLD: z.coerce.number().min(0.3).max(0.9).default(0.45),
  DEEPGRAM_AGENT_EOT_TIMEOUT_MS: z.coerce.number().int().min(300).max(5000).default(1200),
  DEEPGRAM_AGENT_VOICE: z.preprocess(emptyIfPlaceholder, z.string().default('aura-2-thalia-en')),
  DEEPGRAM_BROWSER_PREVIEW_MAX_SECONDS: z.coerce.number().int().min(60).max(600).default(120),
  DEEPGRAM_BROWSER_PREVIEW_MAX_ACTIVE_PER_USER: z.coerce.number().int().min(1).max(2).default(1),
  AI_MAX_SECONDS_PER_CALL: z.coerce.number().int().min(60).max(600).default(180),
  AI_MAX_ACTIVE_CALLS: z.coerce.number().int().min(1).max(5).default(1),
  AI_MAX_MINUTES_PER_DAY: z.coerce.number().int().min(1).max(1440).default(10),
  AI_MAX_COST_USD_PER_DAY: z.coerce.number().min(0.1).max(500).default(1),
  AI_ESTIMATED_COST_USD_PER_MINUTE: z.coerce.number().min(0.01).max(10).default(0.1),
  VOICE_AGENT_TENANT_ID: z.preprocess(emptyIfPlaceholder, z.string().uuid().optional()),
  AI_OUTBOUND_ENABLED: z
    .preprocess((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : v), z.boolean().default(false)),

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

export const VOICE_AGENT_ENABLED = env.VOICE_AGENT_ENABLED;

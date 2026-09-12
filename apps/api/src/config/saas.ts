/**
 * JentoAI Calling SaaS — Centralized Configuration
 * 
 * All TBD business values are marked as placeholders.
 * Feature flags control what is exposed to paid customers.
 * Final values MUST be set before paid activation.
 */

// ── Feature Flags ──────────────────────────────────────────────────────
export const FEATURE_FLAGS = {
  MANUAL_BILLING_ENABLED: process.env.MANUAL_BILLING_ENABLED === 'true',
  CUSTOMER_ONBOARDING_ENABLED: process.env.CUSTOMER_ONBOARDING_ENABLED !== 'false', // default on
  METERED_CALLS_ENABLED: process.env.METERED_CALLS_ENABLED === 'true',
  METERED_MAPS_ENABLED: process.env.METERED_MAPS_ENABLED === 'true',
  CUSTOMER_API_ENABLED: process.env.CUSTOMER_API_ENABLED === 'true',
} as const;

// ── Contact / Payment Details (TBD — set before paid launch) ───────────
export const BUSINESS_CONFIG = {
  WHATSAPP_SUPPORT_NUMBER: process.env.WHATSAPP_SUPPORT_NUMBER || '', // TBD
  JAZZCASH_RECEIVER_NUMBER: process.env.JAZZCASH_RECEIVER_NUMBER || '', // TBD
  JAZZCASH_ACCOUNT_TITLE: process.env.JAZZCASH_ACCOUNT_TITLE || '', // TBD
  PAYMENT_VERIFICATION_HOURS: parseInt(process.env.PAYMENT_VERIFICATION_HOURS || '24', 10),
  SUPPORT_EMAIL: process.env.SUPPORT_EMAIL || '',
} as const;

// ── Calling Defaults ───────────────────────────────────────────────────
export const CALLING_DEFAULTS = {
  ALLOWED_DESTINATION_COUNTRIES: ['US', 'CA'],
  MAX_CALL_SECONDS: 1800, // 30 minutes
  MAX_CONCURRENT_CALLS: 1,
  MAX_DAILY_UNIQUE_DESTINATIONS: 50,
  MAX_DAILY_CALL_ATTEMPTS: 200,
  MAX_PHONE_NUMBERS: 1,
  MAX_SEATS: 1,
  // SignalWire rate per minute (USD) — US/CA outbound
  SIGNALWIRE_RATE_PER_MINUTE_USD: 0.00325,
  BILLING_INCREMENT_SECONDS: 6, // 6-second billing increments
} as const;

// ── Maps / Enrichment Credits ──────────────────────────────────────────
export const MAPS_DEFAULTS = {
  CREDITS_PER_SEARCH_PAGE: 1,
  CREDITS_PER_DETAIL_LOOKUP: 1,
  DEFAULT_MONTHLY_CREDITS: 100,
} as const;

// ── Draft Packages (PKR pricing — finalize before launch) ──────────────
export interface PackageDefinition {
  name: string;
  pkr_price: number;
  duration_days: number;
  max_seats: number;
  max_phone_numbers: number;
  max_concurrent_calls: number;
  max_daily_unique_destinations: number;
  max_daily_call_attempts: number;
  max_call_seconds: number;
  maps_credits: number;
  calling_balance_cents: number; // USD cents for calling
  allowed_countries: string[];
}

export const DRAFT_PACKAGES: Record<string, PackageDefinition> = {
  calling_solo: {
    name: 'Solo Calling Plan',
    pkr_price: 1500,
    duration_days: 30,
    max_seats: 1,
    max_phone_numbers: 1,
    max_concurrent_calls: 1,
    max_daily_unique_destinations: 50,
    max_daily_call_attempts: 200,
    max_call_seconds: 1800,
    maps_credits: 0,
    calling_balance_cents: 500, // $5.00
    allowed_countries: ['US', 'CA'],
  },
  calling_team: {
    name: 'Team Calling Plan',
    pkr_price: 4000,
    duration_days: 30,
    max_seats: 3,
    max_phone_numbers: 3,
    max_concurrent_calls: 2,
    max_daily_unique_destinations: 200,
    max_daily_call_attempts: 500,
    max_call_seconds: 3600,
    maps_credits: 0,
    calling_balance_cents: 1500, // $15.00
    allowed_countries: ['US', 'CA'],
  },
  calling_agency: {
    name: 'Agency Calling Plan',
    pkr_price: 12000,
    duration_days: 30,
    max_seats: 10,
    max_phone_numbers: 10,
    max_concurrent_calls: 5,
    max_daily_unique_destinations: 1000,
    max_daily_call_attempts: 2000,
    max_call_seconds: 7200,
    maps_credits: 0,
    calling_balance_cents: 5000, // $50.00
    allowed_countries: ['US', 'CA'],
  },
  leads_basic: {
    name: 'Basic Leads (3k)',
    pkr_price: 1000,
    duration_days: 30,
    max_seats: 0,
    max_phone_numbers: 0,
    max_concurrent_calls: 0,
    max_daily_unique_destinations: 0,
    max_daily_call_attempts: 0,
    max_call_seconds: 0,
    maps_credits: 3000,
    calling_balance_cents: 0,
    allowed_countries: ['US', 'CA'],
  },
  leads_growth: {
    name: 'Growth Leads (10k)',
    pkr_price: 3000,
    duration_days: 30,
    max_seats: 0,
    max_phone_numbers: 0,
    max_concurrent_calls: 0,
    max_daily_unique_destinations: 0,
    max_daily_call_attempts: 0,
    max_call_seconds: 0,
    maps_credits: 10000,
    calling_balance_cents: 0,
    allowed_countries: ['US', 'CA'],
  },
  leads_pro: {
    name: 'Pro Leads (20k)',
    pkr_price: 5000,
    duration_days: 30,
    max_seats: 0,
    max_phone_numbers: 0,
    max_concurrent_calls: 0,
    max_daily_unique_destinations: 0,
    max_daily_call_attempts: 0,
    max_call_seconds: 0,
    maps_credits: 20000,
    calling_balance_cents: 0,
    allowed_countries: ['US', 'CA'],
  }
};

// ── Auth Defaults ──────────────────────────────────────────────────────
export const AUTH_CONFIG = {
  TEMP_PASSWORD_LENGTH: 24,
  TEMP_PASSWORD_EXPIRY_HOURS: 24,
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_THROTTLE_WINDOW_MINUTES: 15,
  JWT_EXPIRY_SECONDS: 86400, // 24 hours
  SESSION_EXPIRY_HOURS: 168, // 7 days
  PASSWORD_MIN_LENGTH: 8,
} as const;

// ── Roles ──────────────────────────────────────────────────────────────
export const ROLES = {
  PLATFORM_ADMIN: 'platform_admin',
  TENANT_OWNER: 'tenant_owner',
  AGENT: 'agent',
} as const;

export type RoleName = typeof ROLES[keyof typeof ROLES];

// ── Daily Window Timezone ──────────────────────────────────────────────
export const DAILY_WINDOW_TIMEZONE = 'Asia/Karachi';

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

const MAX_SHORT = 125;
const DAILY_LIMIT = 5;
const MEMORY_USAGE = new Map();

const responseSchema = z.object({
  short_alt_text: z.string().min(1).max(125),
  seo_alt_text: z.string().min(1).max(300),
  accessibility_alt_text: z.string().min(1).max(500),
  ecommerce_alt_text: z.string().min(1).max(350),
  notes: z.string().max(500).optional().default(''),
});

const LOCAL_GOOGLE_CREDENTIALS = path.resolve(process.cwd(), 'google-credentials.json');
const CONFIGURED_GOOGLE_CREDENTIALS =
  process.env.GOOGLE_APPLICATION_CREDENTIALS || (fs.existsSync(LOCAL_GOOGLE_CREDENTIALS) ? LOCAL_GOOGLE_CREDENTIALS : '');

function readProjectIdFromCredentials() {
  if (!CONFIGURED_GOOGLE_CREDENTIALS || !fs.existsSync(CONFIGURED_GOOGLE_CREDENTIALS)) {
    return '';
  }

  try {
    const raw = fs.readFileSync(CONFIGURED_GOOGLE_CREDENTIALS, 'utf8');
    const json = JSON.parse(raw);
    return json.project_id || '';
  } catch {
    return '';
  }
}

const VERTEX_LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const VERTEX_MODEL = process.env.VERTEX_ALT_TEXT_MODEL || process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';
const VERTEX_PROJECT =
  process.env.VERTEX_AI_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT ||
  readProjectIdFromCredentials() ||
  '';
const VERTEX_API_BASE = `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1`;

let accessToken = null;
let tokenExpiry = 0;

function normalizeLanguage(language) {
  switch (language) {
    case 'roman_urdu':
      return 'Roman Urdu';
    case 'hindi':
      return 'Hindi';
    default:
      return 'English';
  }
}

function buildPrompt({ keyword, mode, language }) {
  return [
    'You are an expert SEO and accessibility copywriter.',
    'Analyze the provided image and create alt text variants.',
    `Target keyword: ${keyword || 'none'}`,
    `Mode: ${mode}`,
    `Language: ${normalizeLanguage(language)}`,
    'Rules:',
    '1. Describe only visible content.',
    '2. Do not identify private people.',
    '3. Do not infer sensitive attributes including religion, race, health, politics, disability, or age.',
    '4. Use the keyword only if naturally relevant.',
    '5. Do not keyword stuff.',
    '6. Short alt text must be under 125 characters.',
    '7. SEO alt text should be natural and search-friendly.',
    '8. Accessibility alt text should be clear for screen reader users.',
    '9. E-commerce alt text should focus on product details only if the image is product-related.',
    '10. Return JSON only. No markdown. No explanation outside JSON.',
    'Return this exact JSON shape:',
    '{"short_alt_text":"","seo_alt_text":"","accessibility_alt_text":"","ecommerce_alt_text":"","notes":""}',
  ].join('\n');
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('AI_RESPONSE_INVALID');
  }
  return text.slice(start, end + 1);
}

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;

  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({
    keyFilename: CONFIGURED_GOOGLE_CREDENTIALS || undefined,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  accessToken = tokenResponse.token;
  tokenExpiry = Date.now() + 50 * 60 * 1000;
  return accessToken;
}

function parseCandidateText(payload) {
  return (
    payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('') || ''
  );
}

export function detectImageMime(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function getDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getIpHash(ip, dateKey) {
  const salt = process.env.IP_HASH_SALT || 'alt-text-dev-salt';
  return crypto.createHash('sha256').update(`${ip}:${dateKey}:${salt}`).digest('hex');
}

function getRateKey(ip) {
  const dateKey = getDateKey();
  return {
    dateKey,
    ipHash: getIpHash(ip, dateKey),
  };
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function assertUsageAvailable(ip) {
  const { dateKey, ipHash } = getRateKey(ip);
  const key = `${dateKey}_${ipHash}`;
  const count = MEMORY_USAGE.get(key)?.count || 0;
  if (count >= DAILY_LIMIT) {
    return {
      allowed: false,
      count,
      ipHash,
      dateKey,
    };
  }
  return {
    allowed: true,
    count,
    ipHash,
    dateKey,
  };
}

export function recordUsage(ip) {
  const { dateKey, ipHash } = getRateKey(ip);
  const key = `${dateKey}_${ipHash}`;
  const current = MEMORY_USAGE.get(key) || { count: 0, firstUsedAt: new Date().toISOString() };
  const next = {
    ...current,
    count: current.count + 1,
    lastUsedAt: new Date().toISOString(),
  };
  MEMORY_USAGE.set(key, next);
  return { ipHash, dateKey, count: next.count };
}

export async function generateAltText({ buffer, mimeType, keyword, mode, language }) {
  if (!VERTEX_PROJECT) {
    throw new Error('VERTEX_NOT_CONFIGURED');
  }

  const prompt = buildPrompt({ keyword, mode, language });
  const token = await getAccessToken();
  const url = `${VERTEX_API_BASE}/projects/${VERTEX_PROJECT}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: buffer.toString('base64'),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
    ],
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`VERTEX_ERROR:${response.status}:${errorText}`);
  }

  const payload = await response.json();
  const rawText = parseCandidateText(payload);
  const parsed = JSON.parse(extractJson(rawText));
  const result = responseSchema.parse(parsed);

  if (result.short_alt_text.length > MAX_SHORT) {
    result.short_alt_text = result.short_alt_text.slice(0, MAX_SHORT).trim();
  }

  return result;
}

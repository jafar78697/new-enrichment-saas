// Mountable Express app for the Voice Agent module.
// Designed to be mounted inside the apps/api Fastify server via @fastify/express.
// Skips its own cors/helmet because Fastify already handles those at the outer layer.

import express from 'express';
import morgan from 'morgan';
import twimlRoutes from './routes/twiml.js';
import voiceAgentsRoutes from './routes/voice-agents.js';
import analyticsRoutes from './routes/analytics.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requireAuth, requireManager, softAuth } from '../calls-module/middleware/auth.js';
import { VOICE_AGENT_ENABLED } from './config/env.js';

export function createVoiceAgentApp() {
  const app = express();

  app.set('trust proxy', true);
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  // Body parsers scoped to /api
  app.use('/api', express.json());
  app.use('/api', express.urlencoded({ extended: true }));

  // Health probe
  app.get('/api/voice-health', (_req, res) => res.json({
    ok: true,
    module: 'voice-agent',
    enabled: VOICE_AGENT_ENABLED,
  }));

  // TwiML routes do NOT require auth (they are called by Twilio)
  app.use('/api/voice', twimlRoutes);

  // All management routes require auth
  app.use('/api/voice', softAuth);
  app.use('/api/voice/agents', requireAuth, requireManager, voiceAgentsRoutes);
  app.use('/api/voice/analytics', requireAuth, requireManager, analyticsRoutes);

  // 404 + error tail
  app.use('/api/voice', notFoundHandler);
  app.use(errorHandler);

  return app;
}

// Mountable Express app for the calls-backend module.
// Designed to be `app.use(createCallsApp())`d inside the apps/api Fastify
// server via @fastify/express. Skips its own cors/helmet/static-frontend
// because Fastify already handles those concerns at the outer layer.

import express from 'express';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes.js';
import employeesRoutes from './routes/employees.routes.js';
import agentsRoutes from './routes/agents.routes.js';
import contactsRoutes from './routes/contacts.routes.js';
import callsRoutes from './routes/calls.routes.js';
import twilioRoutes from './routes/twilio.routes.js';
import scraperBridgeRoutes from './routes/scraper-bridge.routes.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { softAuth } from './middleware/auth.js';

export function createCallsApp() {
  const app = express();
  // Trust proxy headers from Fastify upstream + Render's load balancer.
  app.set('trust proxy', true);
  // Morgan only when not in test/silent.
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
  // Body parsers — Fastify's parsers don't apply to mounted Express subapps.
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health probe under the calls namespace.
  app.get('/api/calls-health', (_req, res) => res.json({ ok: true, module: 'calls' }));

  // Scraper Bridge (no softAuth because it uses API Key)
  app.use('/api/scraper-bridge', scraperBridgeRoutes);

  // Attach req.user for any /api route below that checks it.
  app.use('/api', softAuth);
  app.use('/api/auth', authRoutes);
  app.use('/api', employeesRoutes);
  app.use('/api/agents', agentsRoutes);
  app.use('/api/contacts', contactsRoutes);
  app.use('/api/calls', callsRoutes);
  app.use('/api', twilioRoutes);

  // 404 + error tail — only fires for unmatched /api/* paths.
  // Fastify will fall through to its own routes for everything else.
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

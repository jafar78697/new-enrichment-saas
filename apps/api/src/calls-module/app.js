import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import agentsRoutes from './routes/agents.routes.js';
import contactsRoutes from './routes/contacts.routes.js';
import callsRoutes from './routes/calls.routes.js';
import twilioRoutes from './routes/twilio.routes.js';
import authRoutes from './routes/auth.routes.js';
import employeesRoutes from './routes/employees.routes.js';
import nichesRoutes from './routes/niches.routes.js';
import scraperBridgeRoutes from './routes/scraper-bridge.routes.js';
import campaignsRoutes from './routes/campaigns.routes.js';
import emailAccountsRoutes from './routes/email-accounts.routes.js';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { softAuth } from './middleware/auth.js';

export function createApp() {
  const app = express();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const frontendPath = path.join(__dirname, '../../../web/dist');

  app.set('trust proxy', true);

  const allowedOrigins = [env.FRONTEND_URL, ...(env.ALLOWED_ORIGINS || [])].filter(Boolean);

  app.use(
    cors({
      origin: (origin, callback) => {
        // No origin (native client / curl / Twilio webhook) -> allow
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`CORS: origin ${origin} not allowed`));
      },
      credentials: true
    })
  );
  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  );
  app.use(morgan('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  // Attach req.user for any route below that checks it.
  app.use('/api', softAuth);

  app.use('/api/auth', authRoutes);
  app.use('/api', employeesRoutes);
  app.use('/api/agents', agentsRoutes);
  app.use('/api/contacts', contactsRoutes);
  app.use('/api/calls', callsRoutes);
  app.use('/api/niches', nichesRoutes);
  app.use('/api/scraper', scraperBridgeRoutes);
  app.use('/api/campaigns', campaignsRoutes);
  app.use('/api/email-accounts', emailAccountsRoutes);
  app.use('/api', twilioRoutes);

  // Serve frontend static files
  app.use(express.static(frontendPath));

  // Catch-all route for frontend (SPA)
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/assets')) {
      return next();
    }
    res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
      if (err) {
        next();
      }
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}


import http from 'http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { initializeDatabase } from './db/index.js';
import { initializeSocket } from './services/socket.service.js';
// import { startCampaignScheduler } from './scheduler.js';
import { startWarmupScheduler } from './warmup.js';

const app = createApp();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: env.FRONTEND_URL,
    credentials: true
  }
});

initializeSocket(io);

initializeDatabase()
  .then(() => {
    // startCampaignScheduler();
    startWarmupScheduler();
    server.listen(env.PORT, () => {
      console.log(`Backend listening on port ${env.PORT}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize local database', error);
    process.exit(1);
  });

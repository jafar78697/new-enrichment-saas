import { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { Pool } from 'pg';
import { createPool } from '@enrichment-saas/db';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
    authenticate: (request: any, reply: any) => Promise<void>;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const pool = createPool({
    connectionString: process.env.DATABASE_URL
  });

  fastify.decorate('db', pool);

  // Removed auto-migrations to prevent locking/timeout issues on startup

  fastify.addHook('onClose', async (instance) => {
    await instance.db.end();
  });
});

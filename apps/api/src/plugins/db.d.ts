import { Pool } from 'pg';
declare module 'fastify' {
    interface FastifyInstance {
        db: Pool;
        authenticate: (request: any, reply: any) => Promise<void>;
    }
}
declare const _default: any;
export default _default;
//# sourceMappingURL=db.d.ts.map
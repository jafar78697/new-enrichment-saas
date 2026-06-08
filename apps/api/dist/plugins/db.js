"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_plugin_1 = __importDefault(require("fastify-plugin"));
const db_1 = require("@enrichment-saas/db");
exports.default = (0, fastify_plugin_1.default)(async (fastify) => {
    const pool = (0, db_1.createPool)({
        connectionString: process.env.DATABASE_URL
    });
    fastify.decorate('db', pool);
    fastify.addHook('onClose', async (instance) => {
        await instance.db.end();
    });
});
//# sourceMappingURL=db.js.map
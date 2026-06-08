"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyManager = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
class ApiKeyManager {
    saltRounds = 10;
    generateKey() {
        // Standard secure format: enr_live_xxxxxx...
        const prefix = 'enr_live_';
        const randomBytes = crypto_1.default.randomBytes(32).toString('hex');
        const key = `${prefix}${randomBytes}`;
        const hash = bcryptjs_1.default.hashSync(key, this.saltRounds);
        return {
            key,
            prefix: prefix + randomBytes.substring(0, 8),
            hash
        };
    }
    verifyKey(key, hash) {
        return bcryptjs_1.default.compareSync(key, hash);
    }
}
exports.ApiKeyManager = ApiKeyManager;
//# sourceMappingURL=api_keys.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthManager = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
class AuthManager {
    privateKey;
    publicKey;
    constructor(privateKey, publicKey) {
        this.privateKey = privateKey;
        this.publicKey = publicKey;
    }
    signUserToken(payload, expiresIn = 86400) {
        return jsonwebtoken_1.default.sign(payload, this.privateKey, {
            algorithm: 'HS256',
            expiresIn
        });
    }
    signUserTokenStr(payload) {
        return this.signUserToken(payload);
    }
    verifyUserToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, this.publicKey, {
                algorithms: ['HS256']
            });
        }
        catch (err) {
            throw new Error('Unauthorized: Invalid or expired token');
        }
    }
}
exports.AuthManager = AuthManager;
//# sourceMappingURL=jwt.js.map
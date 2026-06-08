"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
class WebhookService {
    constructor() { }
    async deliver(url, secret, event, payload) {
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            const signature = this.sign(secret, timestamp, payload);
            await axios_1.default.post(url, payload, {
                headers: {
                    'X-Enrichment-Event': event,
                    'X-Enrichment-Timestamp': timestamp.toString(),
                    'X-Enrichment-Signature': signature
                },
                timeout: 10000 // 10s timeout
            });
            return true;
        }
        catch (err) {
            console.error(`[Webhook] Delivery failed to ${url}`, err);
            return false;
        }
    }
    sign(secret, timestamp, payload) {
        const rawBody = JSON.stringify(payload);
        const hmac = crypto_1.default.createHmac('sha256', secret);
        hmac.update(`${timestamp}.${rawBody}`);
        return hmac.digest('hex');
    }
}
exports.WebhookService = WebhookService;
//# sourceMappingURL=webhook-service.js.map
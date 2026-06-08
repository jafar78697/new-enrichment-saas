"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processAffiliateConversion = processAffiliateConversion;
exports.reverseAffiliateCommission = reverseAffiliateCommission;
async function processAffiliateConversion(fastify, opts) {
    const { stripeEventId, promoCode, saleAmount, planType } = opts;
    // Idempotency: skip if already processed
    const existing = await fastify.db.query(`SELECT id FROM referral_conversions WHERE stripe_event_id = $1`, [stripeEventId]);
    if (existing.rows[0])
        return;
    let affiliateId = null;
    let attributionSource = 'referral_link';
    // Promo code takes precedence over cookie-based attribution
    if (promoCode) {
        const { rows } = await fastify.db.query(`SELECT id FROM affiliates WHERE promo_code = $1 AND status = 'active'`, [promoCode.toUpperCase().trim()]);
        if (rows[0]) {
            affiliateId = rows[0].id;
            attributionSource = 'promo_code';
        }
    }
    if (!affiliateId)
        return; // No attribution found
    // Net revenue = sale amount (taxes/refunds handled via charge.refunded)
    const netRevenue = saleAmount;
    const { rows: convRows } = await fastify.db.query(`INSERT INTO referral_conversions (affiliate_id, stripe_event_id, plan_type, sale_amount, net_revenue, attribution_source)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`, [affiliateId, stripeEventId, planType, saleAmount, netRevenue, attributionSource]);
    const conversionId = convRows[0].id;
    // Calculate commission
    const { rows: affRows } = await fastify.db.query(`SELECT commission_rate FROM affiliates WHERE id = $1`, [affiliateId]);
    const rate = parseFloat(affRows[0]?.commission_rate || '20');
    const commissionAmount = parseFloat((netRevenue * (rate / 100)).toFixed(2));
    await fastify.db.query(`INSERT INTO commissions (affiliate_id, conversion_id, amount, status)
     VALUES ($1,$2,$3,'pending')`, [affiliateId, conversionId, commissionAmount]);
    console.log(`[AFFILIATE] Conversion recorded: affiliate=${affiliateId} commission=$${commissionAmount}`);
}
async function reverseAffiliateCommission(fastify, stripeEventId) {
    const { rows } = await fastify.db.query(`SELECT id, affiliate_id FROM referral_conversions WHERE stripe_event_id = $1`, [stripeEventId]);
    if (!rows[0])
        return;
    await fastify.db.query(`UPDATE commissions SET status='reversed', updated_at=now()
     WHERE conversion_id = $1 AND status IN ('pending','approved')`, [rows[0].id]);
    console.log(`[AFFILIATE] Commission reversed for conversion ${rows[0].id}`);
}
//# sourceMappingURL=affiliate-webhooks.js.map
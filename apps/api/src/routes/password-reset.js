"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = passwordResetRoutes;
const crypto_1 = __importDefault(require("crypto"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const transporter = nodemailer_1.default.createTransport({
    service: 'gmail',
    auth: {
        user: 'scale.ai.jento@gmail.com',
        pass: 'wvledbipemrocjzl', // app password (spaces removed)
    },
});
async function passwordResetRoutes(app) {
    // POST /v1/auth/forgot-password
    app.post('/v1/auth/forgot-password', async (req, reply) => {
        const { email } = req.body;
        if (!email)
            return reply.code(422).send({ error: 'email required' });
        const { rows } = await app.db.query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
        // Always return success (don't reveal if email exists)
        if (!rows[0])
            return { message: 'If this email exists, a reset link has been sent.' };
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await app.db.query(`INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET token=$2, expires_at=$3, used=false`, [rows[0].id, token, expires]);
        const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
        await transporter.sendMail({
            from: '"Enrichment Sys" <scale.ai.jento@gmail.com>',
            to: email,
            subject: 'Reset your password',
            html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#0F766E">Reset your password</h2>
          <p>Click the button below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetUrl}" style="display:inline-block;background:#0F766E;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">
            Reset Password
          </a>
          <p style="color:#666;font-size:13px">If you didn't request this, ignore this email.</p>
          <p style="color:#999;font-size:12px">${resetUrl}</p>
        </div>
      `,
        });
        return { message: 'If this email exists, a reset link has been sent.' };
    });
    // POST /v1/auth/reset-password
    app.post('/v1/auth/reset-password', async (req, reply) => {
        const { token, password } = req.body;
        if (!token || !password)
            return reply.code(422).send({ error: 'token and password required' });
        if (password.length < 6)
            return reply.code(422).send({ error: 'Password must be at least 6 characters' });
        const { rows } = await app.db.query(`SELECT prt.user_id FROM password_reset_tokens prt
       WHERE prt.token = $1 AND prt.expires_at > now() AND prt.used = false`, [token]);
        if (!rows[0])
            return reply.code(400).send({ error: 'Invalid or expired reset link' });
        const hash = bcryptjs_1.default.hashSync(password, 12);
        await app.db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [hash, rows[0].user_id]);
        await app.db.query(`UPDATE password_reset_tokens SET used = true WHERE token = $1`, [token]);
        return { message: 'Password updated successfully' };
    });
}
//# sourceMappingURL=password-reset.js.map
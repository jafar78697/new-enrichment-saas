// Email service — sends employee-invite emails using one of the Gmail accounts
// already provisioned inside jento-mailer (data/mailer.db → table gmail_accounts).
// Falls back to manual SMTP_* env config, and finally to console.log for dev.
//
// Gmail sender resolution order:
//   1. MAILER_DB_PATH + MAILER_SENDER_EMAIL → that exact row
//   2. MAILER_DB_PATH (first active account with a non-empty app_password)
//   3. SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS — plain nodemailer fallback
//   4. console.log preview (dev)
import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';
import { env } from '../config/env.js';

let cachedGmailSender = null;
let cachedGmailSenderAt = 0;
const GMAIL_CACHE_MS = 5 * 60 * 1000; // 5-minute refresh

function resolveGmailSender() {
  if (!env.MAILER_DB_PATH) return null;
  const now = Date.now();
  if (cachedGmailSender && now - cachedGmailSenderAt < GMAIL_CACHE_MS) {
    return cachedGmailSender;
  }
  let db;
  try {
    db = new Database(env.MAILER_DB_PATH, { readonly: true, fileMustExist: true });
  } catch (err) {
    console.warn(`[email] MAILER_DB_PATH unreadable (${env.MAILER_DB_PATH}): ${err.message}`);
    return null;
  }
  try {
    let row = null;
    if (env.MAILER_SENDER_EMAIL) {
      row = db
        .prepare(
          `SELECT email, app_password FROM gmail_accounts
             WHERE LOWER(email) = LOWER(?) AND active = 1 AND app_password IS NOT NULL AND app_password != ''
             LIMIT 1`,
        )
        .get(env.MAILER_SENDER_EMAIL);
    }
    if (!row) {
      row = db
        .prepare(
          `SELECT email, app_password FROM gmail_accounts
             WHERE active = 1 AND app_password IS NOT NULL AND app_password != ''
             ORDER BY id ASC LIMIT 1`,
        )
        .get();
    }
    if (!row) return null;
    cachedGmailSender = { email: row.email, appPassword: row.app_password };
    cachedGmailSenderAt = now;
    return cachedGmailSender;
  } catch (err) {
    console.warn(`[email] Failed to read gmail_accounts: ${err.message}`);
    return null;
  } finally {
    db.close();
  }
}

let transporterPromise = null;
function getSmtpTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_PORT) return null;
  if (!transporterPromise) {
    const transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: !!env.SMTP_SECURE,
      auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    transporterPromise = Promise.resolve(transport);
  }
  return transporterPromise;
}

export async function sendMail({ to, subject, text, html }) {
  const displayName = env.MAILER_FROM_NAME || 'JentoAI';

  // 1) Prefer the Jento Mailer Gmail pool — matches jento-mailer/app.py send()
  const gmail = resolveGmailSender();
  if (gmail) {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmail.email, pass: gmail.appPassword },
    });
    try {
      const info = await transporter.sendMail({
        from: `${displayName} <${gmail.email}>`,
        to,
        subject,
        text,
        html,
      });
      return { delivered: true, via: 'gmail', from: gmail.email, messageId: info.messageId };
    } catch (err) {
      console.warn(`[email] Gmail send failed via ${gmail.email}: ${err.message}`);
      // Invalidate cache so next send tries a fresh lookup
      cachedGmailSender = null;
      cachedGmailSenderAt = 0;
    }
  }

  // 2) Plain SMTP fallback
  const transporter = await getSmtpTransporter();
  const from =
    env.SMTP_FROM || env.ADMIN_EMAIL || `${displayName} <no-reply@calls.jentoai.com>`;
  if (transporter) {
    const info = await transporter.sendMail({ from, to, subject, text, html });
    return { delivered: true, via: 'smtp', from, messageId: info.messageId };
  }

  // 3) Dev preview
  console.log(
    `[email] No sender configured; preview only:\n  From: ${from}\n  To: ${to}\n  Subject: ${subject}\n  ${text || ''}`,
  );
  return { delivered: false, preview: { to, from, subject, text, html } };
}

// Short, simple invite email — plain friendly lines, minimal HTML.
export function buildInviteEmail({ name, acceptUrl, managerName }) {
  const first = (name || '').trim().split(/\s+/)[0] || 'there';
  const inviter = managerName ? `${managerName.trim()}` : 'Your manager';
  const subject = `You're invited to join the JentoAI Call Center`;
  const text = [
    `Hi ${first},`,
    ``,
    `${inviter} has added you to the JentoAI Call Center.`,
    `A dedicated US phone number is ready for you.`,
    ``,
    `Set your password and sign in:`,
    acceptUrl,
    ``,
    `This invite link expires in 7 days.`,
    ``,
    `— JentoAI`,
  ].join('\n');
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#0f172a;max-width:520px;margin:0 auto;padding:24px">
      <p>Hi ${first},</p>
      <p>${inviter} has added you to the <b>JentoAI Call Center</b>.<br/>
         A dedicated US phone number is ready for you.</p>
      <p>Set your password and sign in:</p>
      <p style="margin:20px 0">
        <a href="${acceptUrl}"
           style="background:#0f766e;color:#ffffff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
          Accept invite
        </a>
      </p>
      <p style="font-size:12px;color:#64748b">Or paste this link in your browser:<br/>
        <a href="${acceptUrl}" style="color:#0f766e">${acceptUrl}</a><br/>
        This invite expires in 7 days.
      </p>
      <p style="margin-top:28px;font-size:12px;color:#94a3b8">— JentoAI</p>
    </div>
  `;
  return { subject, text, html };
}

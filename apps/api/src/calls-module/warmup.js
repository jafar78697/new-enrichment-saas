import { query, getPool } from './db/index.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from './config/env.js';
import nodemailer from 'nodemailer';

let isWarmupRunning = false;

// We do a small warmup run every 15 minutes to avoid spamming
async function processWarmup() {
  if (isWarmupRunning) return;
  isWarmupRunning = true;

  const client = await getPool().connect();

  try {
    // We want to send a warmup email from one account to another account belonging to the same user.
    // To keep it simple: find two active accounts.
    const accountsRes = await client.query(`
      SELECT * FROM email_accounts
      WHERE status = 'active'
      ORDER BY RANDOM()
      LIMIT 2
    `);

    if (accountsRes.rowCount < 2) {
      isWarmupRunning = false;
      client.release();
      return; // Need at least 2 accounts to warmup
    }

    const sender = accountsRes.rows[0];
    const receiver = accountsRes.rows[1];

    // Check if sender has reached their total limits
    if (sender.sent_today >= sender.daily_limit) {
      isWarmupRunning = false;
      client.release();
      return;
    }

    console.log(`[Warmup] Sending from ${sender.email} to ${receiver.email}`);

    let generatedEmail = "Hi there, just wanted to check if we are still on for the meeting later today?";
    let subjectLine = "Meeting today";

    if (env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Write a very short, realistic business email (1-2 sentences) from a colleague asking a quick question or checking in. Do NOT include placeholders like [Name]. Just the text.`;
        const result = await model.generateContent(prompt);
        generatedEmail = result.response.text();
        
        const subjResult = await model.generateContent(`Based on this email: "${generatedEmail}", write a 2-4 word subject line. ONLY the subject line.`);
        subjectLine = subjResult.response.text().replace(/\\n/g, '');
      } catch (e) {
        console.error("[Warmup] Gemini Error:", e);
      }
    }

    // Send email
    try {
      const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
          user: sender.email,
          pass: sender.app_password
        }
      });

      await transporter.sendMail({
        from: `"Team" <${sender.email}>`,
        to: receiver.email,
        subject: subjectLine,
        text: generatedEmail
      });

      // Update state
      await client.query('UPDATE email_accounts SET sent_today = sent_today + 1 WHERE id = $1', [sender.id]);
      await client.query(
        'INSERT INTO warmup_logs (sender_email, recipient_email, subject, body) VALUES ($1, $2, $3, $4)',
        [sender.email, receiver.email, subjectLine, generatedEmail]
      );
      
      console.log(`[Warmup] Success: ${sender.email} -> ${receiver.email}`);
    } catch (smtpErr) {
      console.error('[Warmup] SMTP Error:', smtpErr);
    }
  } catch (err) {
    console.error('[Warmup] Loop error:', err);
  } finally {
    client.release();
    isWarmupRunning = false;
  }
}

export function startWarmupScheduler() {
  console.log('[Warmup Scheduler] Started background loop (15m interval)');
  // Run every 15 minutes
  setInterval(processWarmup, 15 * 60 * 1000);
}

import { getPool } from './apps/api/src/calls-module/db/index.js';
import dotenv from 'dotenv';
dotenv.config({ path: './apps/api/.env.production' });

async function run() {
  try {
    const p = getPool();
    const result = await p.query(`
      SELECT 
        COUNT(*)::int AS calls_today,
        COALESCE(SUM(duration_seconds) / 60, 0)::int AS ai_minutes,
        COALESCE(AVG(duration_seconds), 0)::int AS avg_duration,
        SUM(CASE WHEN outcome = 'appointment_booked' THEN 1 ELSE 0 END)::int AS appointments_booked,
        SUM(CASE WHEN sentiment_score >= 0.5 THEN 1 ELSE 0 END)::int AS positive_sentiment,
        SUM(CASE WHEN sentiment_score > -0.5 AND sentiment_score < 0.5 THEN 1 ELSE 0 END)::int AS neutral_sentiment,
        SUM(CASE WHEN sentiment_score <= -0.5 THEN 1 ELSE 0 END)::int AS negative_sentiment,
        COALESCE(SUM((cost_breakdown->'twilio'->>'total')::numeric), 0) AS twilio_cost,
        COALESCE(SUM((cost_breakdown->'openAI'->>'cost')::numeric), 0) AS openai_cost,
        COALESCE(SUM((cost_breakdown->'vertexAI'->>'inputTokens')::numeric) + SUM((cost_breakdown->'openAI'->>'inputTokens')::numeric), 0)::int AS token_usage
      FROM voice_call_sessions
      WHERE created_at > now() - interval '24 hours'
    `);
    console.log(result.rows[0]);
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();

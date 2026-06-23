import { Router } from 'express';
import { asyncHandler } from '../utils/errors.js';

const router = Router();

import { query } from '../../calls-module/db/index.js';

router.get('/summary', asyncHandler(async (req, res) => {
  const result = await query(`
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

  const row = result.rows[0] || {};
  const twilio = parseFloat(row.twilio_cost || 0);
  const openai = parseFloat(row.openai_cost || 0);

  res.json({
    callsToday: row.calls_today || 0,
    aiMinutes: row.ai_minutes || 0,
    avgDuration: row.avg_duration || 0,
    appointmentsBooked: row.appointments_booked || 0,
    sentimentDistribution: { 
      positive: row.positive_sentiment || 0, 
      neutral: row.neutral_sentiment || 0, 
      negative: row.negative_sentiment || 0 
    },
    costPerCall: row.calls_today > 0 ? (twilio + openai) / row.calls_today : 0,
    twilioCost: twilio,
    openaiCost: openai,
    tokenUsage: row.token_usage || 0,
    revenue: 0,
  });
}));

export default router;

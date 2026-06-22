import { Router } from 'express';
import { asyncHandler } from '../utils/errors.js';

const router = Router();

router.get('/summary', asyncHandler(async (req, res) => {
  res.json({
    callsToday: 0,
    aiMinutes: 0,
    avgDuration: 0,
    appointmentsBooked: 0,
    sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
    costPerCall: 0,
    tokenUsage: 0,
    revenue: 0,
  });
}));

export default router;

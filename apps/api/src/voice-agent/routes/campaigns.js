import { Router } from 'express';
import { asyncHandler, AppError } from '../utils/errors.js';

const router = Router();

/**
 * POST /api/voice/campaigns/call
 * Triggers an outbound call to a given number, connecting them to the AI agent.
 */
router.post('/call', asyncHandler(async (req, res) => {
  throw new AppError('Legacy direct calling is disabled. Use the consent-gated AI Calling queue.', 410);
}));

export default router;

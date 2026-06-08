import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { requireAuth, canAccessAgent } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const where = req.user.role === 'manager' ? '' : 'WHERE id = $1';
    const params = req.user.role === 'manager' ? [] : [req.user.id];
    const result = await query(
      `
        SELECT id, name, email, twilio_identity, twilio_phone_number, is_available, role, status, created_at, updated_at
        FROM agents
        ${where}
        ORDER BY name ASC
      `,
      params
    );

    res.json({ agents: result.rows });
  })
);

router.patch(
  '/:id/availability',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    if (!canAccessAgent(req.user, params.id)) {
      throw new AppError('You can only update your own availability', 403);
    }

    const body = z.object({
      isAvailable: z.boolean()
    }).parse(req.body);

    const result = await query(
      `
        UPDATE agents
        SET is_available = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, name, email, twilio_identity, twilio_phone_number, is_available, role, status, created_at, updated_at
      `,
      [params.id, body.isAvailable]
    );

    if (result.rowCount === 0) {
      throw new AppError('Agent not found', 404);
    }

    res.json({ agent: result.rows[0] });
  })
);

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT id, name, email, twilio_identity, is_available, created_at, updated_at
        FROM agents
        ORDER BY name ASC
      `
    );

    res.json({ agents: result.rows });
  })
);

router.patch(
  '/:id/availability',
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    const body = z.object({
      isAvailable: z.boolean()
    }).parse(req.body);

    const result = await query(
      `
        UPDATE agents
        SET is_available = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, name, email, twilio_identity, is_available, created_at, updated_at
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

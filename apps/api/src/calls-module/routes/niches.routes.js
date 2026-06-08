import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { requireAuth, requireManager } from '../middleware/auth.js';

const router = Router();

const nicheSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  assigned_agent_id: z.coerce.number().int().positive().optional().nullable()
});

// List all niches (Manager only)
router.get(
  '/',
  requireAuth,
  requireManager,
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT 
          n.*,
          a.name as agent_name,
          a.email as agent_email,
          (SELECT COUNT(*) FROM contacts WHERE niche_id = n.id) as contact_count
        FROM niches n
        LEFT JOIN agents a ON n.assigned_agent_id = a.id
        ORDER BY n.created_at DESC
      `
    );
    res.json({ niches: result.rows });
  })
);

// Get my assigned niches (Employee)
router.get(
  '/my',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT 
          n.*,
          (SELECT COUNT(*) FROM contacts WHERE niche_id = n.id) as contact_count
        FROM niches n
        WHERE n.assigned_agent_id = $1
        ORDER BY n.created_at DESC
      `,
      [req.user.id]
    );
    res.json({ niches: result.rows });
  })
);

// Create niche (Manager only)
router.post(
  '/',
  requireAuth,
  requireManager,
  asyncHandler(async (req, res) => {
    const payload = nicheSchema.parse(req.body);
    const result = await query(
      `
        INSERT INTO niches (name, description, assigned_agent_id)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [payload.name.trim(), payload.description || null, payload.assigned_agent_id || null]
    );
    res.status(201).json({ niche: result.rows[0] });
  })
);

// Update niche (Manager only)
router.patch(
  '/:id',
  requireAuth,
  requireManager,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const payload = nicheSchema.partial().parse(req.body);
    
    const fields = [];
    const values = [];
    
    if (payload.name !== undefined) {
      fields.push(`name = $${fields.length + 1}`);
      values.push(payload.name.trim());
    }
    if (payload.description !== undefined) {
      fields.push(`description = $${fields.length + 1}`);
      values.push(payload.description || null);
    }
    if (payload.assigned_agent_id !== undefined) {
      fields.push(`assigned_agent_id = $${fields.length + 1}`);
      values.push(payload.assigned_agent_id || null);
    }
    
    if (fields.length === 0) {
      throw new AppError('No fields to update', 400);
    }
    
    values.push(id);
    const result = await query(
      `
        UPDATE niches 
        SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${values.length}
        RETURNING *
      `,
      values
    );
    
    if (result.rowCount === 0) {
      throw new AppError('Niche not found', 404);
    }
    
    res.json({ niche: result.rows[0] });
  })
);

// Delete niche (Manager only)
router.delete(
  '/:id',
  requireAuth,
  requireManager,
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const result = await query('DELETE FROM niches WHERE id = $1 RETURNING *', [id]);
    
    if (result.rowCount === 0) {
      throw new AppError('Niche not found', 404);
    }
    
    res.json({ message: 'Niche deleted successfully' });
  })
);

export default router;

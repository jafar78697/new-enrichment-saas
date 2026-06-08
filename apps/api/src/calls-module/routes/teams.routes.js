import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { requireManager } from '../middleware/auth.js';

const router = Router();

const teamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().optional(),
  leader_id: z.number().int().positive().nullable().optional(),
});

// Create Team
router.post(
  '/teams',
  requireManager,
  asyncHandler(async (req, res) => {
    const { name, description, leader_id } = teamSchema.parse(req.body);
    
    try {
      const result = await query(
        'INSERT INTO teams (name, description, leader_id) VALUES ($1, $2, $3) RETURNING *',
        [name, description || null, leader_id || null]
      );
      
      // If a leader is assigned, update their role to team_leader
      if (leader_id) {
        await query('UPDATE agents SET role = $1 WHERE id = $2 AND role = $3', ['team_leader', leader_id, 'employee']);
      }

      res.status(201).json({ id: result.lastInsertRowid, name, description, leader_id });
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) {
        throw new AppError('Team name already exists', 409);
      }
      throw e;
    }
  })
);

// Get All Teams
router.get(
  '/teams',
  requireManager,
  asyncHandler(async (req, res) => {
    const result = await query(`
      SELECT t.*, a.name as leader_name 
      FROM teams t
      LEFT JOIN agents a ON t.leader_id = a.id
      ORDER BY t.created_at DESC
    `);
    res.json({ teams: result.rows });
  })
);

// Update Team
router.put(
  '/teams/:id',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, description, leader_id } = teamSchema.parse(req.body);

    const existingResult = await query('SELECT leader_id FROM teams WHERE id = $1', [id]);
    const existing = existingResult.rows[0];
    if (!existing) throw new AppError('Team not found', 404);

    try {
      await query(
        'UPDATE teams SET name = $1, description = $2, leader_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
        [name, description || null, leader_id || null, id]
      );
      
      // If leader changed, maybe demote the old one if they don't lead any other teams? 
      // For simplicity, we just promote the new one.
      if (leader_id && leader_id !== existing.leader_id) {
         await query('UPDATE agents SET role = $1 WHERE id = $2 AND role = $3', ['team_leader', leader_id, 'employee']);
      }

      res.json({ id, name, description, leader_id });
    } catch (e) {
      if (e.message.includes('UNIQUE constraint failed')) {
        throw new AppError('Team name already exists', 409);
      }
      throw e;
    }
  })
);

// Delete Team
router.delete(
  '/teams/:id',
  requireManager,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    await query('UPDATE agents SET team_id = NULL WHERE team_id = $1', [id]);
    const result = await query('DELETE FROM teams WHERE id = $1', [id]);
    if (result.rowCount === 0) throw new AppError('Team not found', 404);
    res.json({ ok: true });
  })
);

export default router;

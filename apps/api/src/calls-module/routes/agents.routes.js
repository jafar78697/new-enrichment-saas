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
    const params = [];
    const where = [];

    if (req.tenantId) {
      params.push(req.tenantId);
      where.push(`tenant_id = $${params.length}`);
    }

    if (req.user.role !== 'manager') {
      params.push(req.user.id);
      where.push(`id = $${params.length}`);
    }

    const result = await query(
      `
        SELECT id, tenant_id, name, email, signalwire_identity, signalwire_phone_number, is_available, role, status, created_at, updated_at, linkedin_cookie, linkedin_daily_limit, linkedin_connection_template, reddit_session, reddit_daily_limit, reddit_connection_template
        FROM agents
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
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
          ${req.tenantId ? 'AND tenant_id = $3' : ''}
        RETURNING id, name, email, signalwire_identity, signalwire_phone_number, is_available, role, status, created_at, updated_at
      `,
      req.tenantId ? [params.id, body.isAvailable, req.tenantId] : [params.id, body.isAvailable]
    );

    if (result.rowCount === 0) {
      throw new AppError('Agent not found', 404);
    }

    res.json({ agent: result.rows[0] });
  })
);

router.patch(
  '/:id/linkedin',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    if (!canAccessAgent(req.user, params.id)) {
      throw new AppError('You can only update your own LinkedIn settings', 403);
    }

    const body = z.object({
      cookie: z.string().nullable().optional(),
      daily_limit: z.number().int().positive().optional(),
      connection_template: z.string().optional()
    }).parse(req.body);

    const updates = [];
    const values = [params.id];
    let paramIndex = 2;

    if (body.cookie !== undefined) {
      updates.push(`linkedin_cookie = $${paramIndex++}`);
      values.push(body.cookie);
    }
    if (body.daily_limit !== undefined) {
      updates.push(`linkedin_daily_limit = $${paramIndex++}`);
      values.push(body.daily_limit);
    }
    if (body.connection_template !== undefined) {
      updates.push(`linkedin_connection_template = $${paramIndex++}`);
      values.push(body.connection_template);
    }

    if (updates.length === 0) {
      return res.json({ message: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await query(
      `
        UPDATE agents
        SET ${updates.join(', ')}
        WHERE id = $1
          ${req.tenantId ? `AND tenant_id = $${paramIndex}` : ''}
        RETURNING id, name, email, linkedin_cookie, linkedin_daily_limit, linkedin_connection_template
      `,
      req.tenantId ? [...values, req.tenantId] : values
    );

    if (result.rowCount === 0) {
      throw new AppError('Agent not found', 404);
    }

    res.json({ success: true });
  })
);

router.patch(
  '/:id/reddit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    if (!canAccessAgent(req.user, params.id)) {
      throw new AppError('You can only update your own Reddit settings', 403);
    }

    const body = z.object({
      session: z.string().nullable().optional(),
      daily_limit: z.number().int().positive().optional(),
      connection_template: z.string().optional()
    }).parse(req.body);

    const updates = [];
    const values = [params.id];
    let paramIndex = 2;

    if (body.session !== undefined) {
      updates.push(`reddit_session = $${paramIndex++}`);
      values.push(body.session);
    }
    if (body.daily_limit !== undefined) {
      updates.push(`reddit_daily_limit = $${paramIndex++}`);
      values.push(body.daily_limit);
    }
    if (body.connection_template !== undefined) {
      updates.push(`reddit_connection_template = $${paramIndex++}`);
      values.push(body.connection_template);
    }

    if (updates.length === 0) {
      return res.json({ message: 'No fields to update' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await query(
      `
        UPDATE agents
        SET ${updates.join(', ')}
        WHERE id = $1
          ${req.tenantId ? `AND tenant_id = $${paramIndex}` : ''}
        RETURNING id, name, email, reddit_session, reddit_daily_limit, reddit_connection_template
      `,
      req.tenantId ? [...values, req.tenantId] : values
    );

    if (result.rowCount === 0) {
      throw new AppError('Agent not found', 404);
    }

    res.json({ success: true });
  })
);

export default router;

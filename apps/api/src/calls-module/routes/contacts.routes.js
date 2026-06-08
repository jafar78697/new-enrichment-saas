import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { query } from '../db/index.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const contactSchema = z.object({
  name: z.string().min(1),
  phone_number: z.string().min(3),
  company: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable(),
  assigned_agent_id: z.coerce.number().int().positive().optional().nullable(),
  source: z.string().optional().nullable(),
  niche_id: z.coerce.number().int().positive().optional().nullable()
});

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = [];
    const where = [];
    if (req.user.role !== 'manager' && req.user.role !== 'owner' && req.user.role !== 'admin') {
      // Employees only see leads from niches assigned to them
      const agentNiches = await query('SELECT id FROM niches WHERE assigned_agent_id = $1', [req.user.id]);
      const nicheIds = agentNiches.rows.map(n => n.id);
      
      if (nicheIds.length === 0) {
        return res.json({ contacts: [] });
      }
      
      where.push(`c.niche_id IN (${nicheIds.join(', ')})`);
    } else if (req.query.niche_id) {
      params.push(req.query.niche_id);
      where.push(`c.niche_id = $${params.length}`);
    }
    const result = await query(
      `
        SELECT
          c.*,
          (
            SELECT status
            FROM calls
            WHERE contact_id = c.id
            ORDER BY
              CASE WHEN started_at IS NULL THEN 1 ELSE 0 END ASC,
              started_at DESC,
              id DESC
            LIMIT 1
          ) AS last_call_status,
          (
            SELECT outcome
            FROM calls
            WHERE contact_id = c.id
            ORDER BY
              CASE WHEN started_at IS NULL THEN 1 ELSE 0 END ASC,
              started_at DESC,
              id DESC
            LIMIT 1
          ) AS last_call_outcome,
          (
            SELECT started_at
            FROM calls
            WHERE contact_id = c.id
            ORDER BY
              CASE WHEN started_at IS NULL THEN 1 ELSE 0 END ASC,
              started_at DESC,
              id DESC
            LIMIT 1
          ) AS last_called_at,
          n.name as niche_name
        FROM contacts c
        LEFT JOIN niches n ON c.niche_id = n.id
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY c.created_at DESC, c.id DESC
      `,
      params
    );

    res.json({ contacts: result.rows });
  })
);

router.post(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const payload = contactSchema.parse(req.body);
    const assignedAgentId =
      req.user.role === 'manager'
        ? payload.assigned_agent_id || null
        : req.user.id;
    const result = await query(
      `
        INSERT INTO contacts (name, phone_number, company, email, notes, assigned_agent_id, source, niche_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `,
      [
        payload.name.trim(),
        payload.phone_number.trim(),
        payload.company || null,
        payload.email || null,
        payload.notes || null,
        assignedAgentId,
        payload.source || 'manual',
        payload.niche_id || null
      ]
    );

    res.status(201).json({ contact: result.rows[0] });
  })
);

router.post(
  '/import-csv',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError('CSV file is required', 400);
    }

    const records = parse(req.file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (!records.length) {
      throw new AppError('CSV file does not contain any rows', 400);
    }

    const normalized = records.map((record) =>
      contactSchema.parse({
        name: record.name,
        phone_number: record.phone_number || record.phone || record.number,
        company: record.company || null,
        email: record.email || null,
        notes: record.notes || null,
        assigned_agent_id: record.assigned_agent_id || record.agent_id || null,
        source: record.source || 'csv'
      })
    );

    const values = [];
    const placeholders = normalized.map((contact, index) => {
      const assignedAgentId =
        req.user.role === 'manager'
          ? contact.assigned_agent_id || null
          : req.user.id;
      const offset = index * 8;
      values.push(
        contact.name,
        contact.phone_number,
        contact.company || null,
        contact.email || null,
        contact.notes || null,
        assignedAgentId,
        contact.source || 'csv',
        contact.niche_id || null
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`;
    });

    const result = await query(
      `
        INSERT INTO contacts (name, phone_number, company, email, notes, assigned_agent_id, source, niche_id)
        VALUES ${placeholders.join(', ')}
        RETURNING *
      `,
      values
    );

    res.status(201).json({
      imported: result.rowCount,
      contacts: result.rows
    });
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { notes, meeting_time } = req.body;
    
    const updates = [];
    const values = [];
    
    if (notes !== undefined) {
      values.push(notes);
      updates.push(`notes = $${values.length}`);
    }
    
    if (meeting_time !== undefined) {
      values.push(meeting_time);
      updates.push(`meeting_time = $${values.length}`);
    }
    
    if (updates.length === 0) {
      const current = await query('SELECT * FROM contacts WHERE id = $1', [id]);
      if (current.rowCount === 0) throw new AppError('Contact not found', 404);
      return res.json({ contact: current.rows[0] });
    }
    
    values.push(id);
    const queryStr = `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`;
    
    const result = await query(queryStr, values);
    
    if (result.rowCount === 0) {
      throw new AppError('Contact not found', 404);
    }
    
    res.json({ contact: result.rows[0] });
  })
);

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const result = await query('DELETE FROM contacts WHERE id = $1 RETURNING *', [id]);
    if (result.rowCount === 0) {
      throw new AppError('Contact not found', 404);
    }
    // Also delete associated calls if any
    await query('DELETE FROM calls WHERE contact_id = $1', [id]);
    res.json({ message: 'Contact deleted' });
  })
);

router.delete(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    // Manager only for clear all
    if (req.user.role !== 'manager') {
      throw new AppError('Only managers can clear all contacts', 403);
    }
    const result = await query('DELETE FROM contacts');
    // Also delete all calls (but they cascade usually, let's be explicit)
    await query('DELETE FROM calls WHERE contact_id IS NOT NULL');
    res.json({ deletedCount: result.rowCount, message: 'All contacts cleared' });
  })
);

export default router;

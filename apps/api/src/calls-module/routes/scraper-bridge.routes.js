import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { AppError, asyncHandler } from '../utils/errors.js';
import { env } from '../config/env.js';

const router = Router();

const leadsBatchSchema = z.object({
  niche_id: z.coerce.number().int().positive().optional(),
  niche_name: z.string().min(1).optional(),
  leads: z.array(z.object({
    name: z.string().min(1),
    phone_number: z.string().min(3),
    company: z.string().optional().nullable(),
    email: z.string().email().optional().nullable().or(z.literal('')),
    notes: z.string().optional().nullable(),
    source: z.string().optional().nullable(),
    website: z.string().optional().nullable(),
    linkedin: z.string().optional().nullable(),
    facebook: z.string().optional().nullable(),
    instagram: z.string().optional().nullable(),
    score: z.coerce.number().int().optional().default(0)
  }))
}).refine(data => data.niche_id || data.niche_name, {
  message: "Either niche_id or niche_name must be provided"
});

// Middleware for API Key auth
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== env.SCRAPER_API_KEY) {
    throw new AppError('Invalid or missing API Key', 401);
  }
  next();
}

// Push leads from scraper
router.post(
  '/push-leads',
  requireApiKey,
  asyncHandler(async (req, res) => {
    const payload = leadsBatchSchema.parse(req.body);
    
    let nicheId = payload.niche_id;
    let assignedAgentId = null;

    if (nicheId) {
      const nicheResult = await query('SELECT id, assigned_agent_id FROM niches WHERE id = $1', [nicheId]);
      if (nicheResult.rowCount === 0) throw new AppError('Niche not found', 404);
      assignedAgentId = nicheResult.rows[0].assigned_agent_id;
    } else if (payload.niche_name) {
      const nicheResult = await query('SELECT id, assigned_agent_id FROM niches WHERE name = $1', [payload.niche_name]);
      if (nicheResult.rowCount > 0) {
        nicheId = nicheResult.rows[0].id;
        assignedAgentId = nicheResult.rows[0].assigned_agent_id;
      } else {
        const insertResult = await query('INSERT INTO niches (name) VALUES ($1) RETURNING id', [payload.niche_name.trim()]);
        nicheId = insertResult.rows[0].id;
      }
    }
    
    const values = [];
    const placeholders = payload.leads.map((lead, index) => {
      let combinedNotes = lead.notes || '';

      const offset = index * 13;
      values.push(
        lead.name.trim(),
        lead.phone_number.trim(),
        lead.company || null,
        lead.email || null,
        combinedNotes.trim() || null,
        assignedAgentId, // Auto-assign to niche owner
        lead.source || 'scraper',
        nicheId,
        lead.website || null,
        lead.linkedin || null,
        lead.facebook || null,
        lead.instagram || null,
        lead.score || 0
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`;
    });

    if (placeholders.length === 0) {
      return res.json({ imported: 0, message: 'No leads provided' });
    }

    // Using ON CONFLICT to skip existing phone numbers (phone_number is UNIQUE)
    const result = await query(
      `
        INSERT INTO contacts (name, phone_number, company, email, notes, assigned_agent_id, source, niche_id, website, linkedin, facebook, instagram, score)
        VALUES ${placeholders.join(', ')}
        ON CONFLICT(phone_number) DO UPDATE SET
          niche_id = COALESCE(contacts.niche_id, EXCLUDED.niche_id),
          assigned_agent_id = COALESCE(contacts.assigned_agent_id, EXCLUDED.assigned_agent_id),
          email = COALESCE(contacts.email, EXCLUDED.email),
          notes = COALESCE(contacts.notes, EXCLUDED.notes),
          website = COALESCE(contacts.website, EXCLUDED.website),
          linkedin = COALESCE(contacts.linkedin, EXCLUDED.linkedin),
          facebook = COALESCE(contacts.facebook, EXCLUDED.facebook),
          instagram = COALESCE(contacts.instagram, EXCLUDED.instagram),
          score = COALESCE(contacts.score, EXCLUDED.score)
        RETURNING *
      `,
      values
    );

    res.status(201).json({
      imported: result.rowCount,
      message: `${result.rowCount} leads pushed to niche ${nicheId}`
    });
  })
);

export default router;

import { Router } from 'express';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { query } from '../db/index.js';
import { AppError, asyncHandler } from '../utils/errors.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

const contactSchema = z.object({
  name: z.string().min(1),
  phone_number: z.string().min(3),
  company: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  notes: z.string().optional().nullable()
});

router.get(
  '/',
  asyncHandler(async (req, res) => {
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
          ) AS last_called_at
        FROM contacts c
        ORDER BY c.created_at DESC, c.id DESC
      `
    );

    res.json({ contacts: result.rows });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const payload = contactSchema.parse(req.body);
    const result = await query(
      `
        INSERT INTO contacts (name, phone_number, company, email, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        payload.name.trim(),
        payload.phone_number.trim(),
        payload.company || null,
        payload.email || null,
        payload.notes || null
      ]
    );

    res.status(201).json({ contact: result.rows[0] });
  })
);

router.post(
  '/import-csv',
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
        notes: record.notes || null
      })
    );

    const values = [];
    const placeholders = normalized.map((contact, index) => {
      const offset = index * 5;
      values.push(
        contact.name,
        contact.phone_number,
        contact.company || null,
        contact.email || null,
        contact.notes || null
      );
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`;
    });

    const result = await query(
      `
        INSERT INTO contacts (name, phone_number, company, email, notes)
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

export default router;

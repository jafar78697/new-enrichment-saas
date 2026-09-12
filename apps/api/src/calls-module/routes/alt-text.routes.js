import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../utils/errors.js';
import {
  assertUsageAvailable,
  detectImageMime,
  generateAltText,
  getClientIp,
  recordUsage,
} from '../services/alt-text.service.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const bodySchema = z.object({
  keyword: z.string().max(120).optional().default(''),
  mode: z.enum(['general', 'seo', 'accessibility', 'ecommerce']).optional().default('general'),
  language: z.enum(['english', 'roman_urdu', 'hindi']).optional().default('english'),
});

function sendError(res, status, code, message) {
  return res.status(status).json({
    error: {
      code,
      message,
    },
  });
}

function uploadImage(req, res, next) {
  upload.single('image')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return sendError(res, 413, 'FILE_TOO_LARGE', 'Images must be smaller than 5MB.');
    }
    return next(err);
  });
}

router.get('/alt-text-health', (_req, res) => {
  res.json({ ok: true });
});

router.post(
  '/alt-text',
  uploadImage,
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return sendError(res, 400, 'IMAGE_REQUIRED', 'Please upload an image.');
    }

    const parsedBody = bodySchema.safeParse(req.body || {});
    if (!parsedBody.success) {
      return sendError(res, 400, 'INVALID_INPUT', 'Please provide valid mode, language, and keyword values.');
    }

    const mimeFromBytes = detectImageMime(req.file.buffer);
    if (!mimeFromBytes || !['image/jpeg', 'image/png', 'image/webp'].includes(mimeFromBytes)) {
      return sendError(res, 415, 'UNSUPPORTED_IMAGE_TYPE', 'Only JPG, PNG, and WebP images are supported.');
    }

    const ip = getClientIp(req);
    const usage = assertUsageAvailable(ip);
    if (!usage.allowed) {
      return sendError(res, 429, 'DAILY_LIMIT_REACHED', 'You have used your 5 free generations for today.');
    }

    try {
      const result = await generateAltText({
        buffer: req.file.buffer,
        mimeType: mimeFromBytes,
        keyword: parsedBody.data.keyword,
        mode: parsedBody.data.mode,
        language: parsedBody.data.language,
      });

      const usageRecord = recordUsage(ip);
      console.info('[alt-text]', {
        ipHashPrefix: usageRecord.ipHash.slice(0, 8),
        date: usageRecord.dateKey,
        count: usageRecord.count,
        imageSize: req.file.size,
        imageMime: mimeFromBytes,
        mode: parsedBody.data.mode,
        language: parsedBody.data.language,
      });

      return res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[alt-text] generation failed', message);

      if (message === 'VERTEX_NOT_CONFIGURED') {
        return sendError(res, 503, 'AI_NOT_CONFIGURED', 'The AI service is not configured yet.');
      }

      return sendError(res, 502, 'AI_GENERATION_FAILED', 'The AI could not generate alt text right now. Please try again.');
    }
  })
);

export default router;

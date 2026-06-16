import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/errors.js';
import { processNewLead } from '../services/real-estate.service.js';

const router = Router();

// Webhook endpoint for Facebook Lead Ads or our React Mockup Form
router.post(
  '/webhook',
  asyncHandler(async (req, res) => {
    // Validate incoming lead data
    const leadSchema = z.object({
      name: z.string(),
      phone: z.string(),
      email: z.string().email(),
      propertyType: z.string(),
      budget: z.string(),
      timeframe: z.string(),
      tenantId: z.string().optional()
    });

    const leadData = leadSchema.parse(req.body);

    console.log('[Real Estate Webhook] Received new lead:', leadData.name);

    // Process the lead (CRM Save, Agent Match, Call Bridging, Auto Email)
    const result = await processNewLead(leadData);

    res.json({
      success: true,
      message: 'Lead processed successfully',
      data: result
    });
  })
);

export default router;

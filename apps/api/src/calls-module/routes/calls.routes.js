import axios from 'axios';
import { env } from '../config/env.js';
import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db/index.js';
import { twilioClient, twilio } from '../config/twilio.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { absoluteUrl } from '../utils/http.js';
import { emitToAgent } from '../services/socket.service.js';
import { fetchCallByIdentifier } from '../services/call-events.service.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const filters = z.object({
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      agentId: z.coerce.number().int().positive().optional(),
      outcome: z.string().optional(),
      status: z.string().optional(),
      contactId: z.coerce.number().int().positive().optional(),
      callSid: z.string().optional()
    }).parse(req.query);

    const where = [];
    const params = [];

    if (filters.dateFrom) {
      params.push(filters.dateFrom);
      where.push(`c.started_at >= $${params.length}`);
    }

    if (filters.dateTo) {
      params.push(filters.dateTo);
      where.push(`c.started_at <= $${params.length}`);
    }

    if (filters.agentId) {
      params.push(filters.agentId);
      where.push(`c.agent_id = $${params.length}`);
    }

    if (filters.outcome) {
      params.push(filters.outcome);
      where.push(`c.outcome = $${params.length}`);
    }

    if (filters.status) {
      params.push(filters.status);
      where.push(`c.status = $${params.length}`);
    }

    if (filters.contactId) {
      params.push(filters.contactId);
      where.push(`c.contact_id = $${params.length}`);
    }

    if (filters.callSid) {
      params.push(filters.callSid);
      where.push(`(c.call_sid = $${params.length} OR c.child_call_sid = $${params.length})`);
    }

    if (req.user.role !== 'manager') {
      params.push(req.user.id);
      where.push(`c.agent_id = $${params.length}`);
    }

    const result = await query(
      `
        SELECT
          c.*,
          contacts.name AS contact_name,
          contacts.phone_number AS contact_phone_number,
          contacts.company AS contact_company,
          agents.name AS agent_name,
          vcs.transcript,
          vcs.summary,
          vcs.metadata
        FROM calls c
        LEFT JOIN contacts ON contacts.id = c.contact_id
        LEFT JOIN agents ON agents.id = c.agent_id
        LEFT JOIN voice_call_sessions vcs ON vcs.call_sid = c.call_sid OR vcs.call_sid = c.child_call_sid
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY
          CASE WHEN c.started_at IS NULL THEN 1 ELSE 0 END ASC,
          c.started_at DESC,
          c.id DESC
        LIMIT 250
      `,
      params
    );

    res.json({ calls: result.rows });
  })
);

router.patch(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    const payload = z.object({
      outcome: z.enum(['connected', 'voicemail', 'no_answer', 'busy']).nullable().optional(),
      notes: z.string().max(5000).nullable().optional()
    }).parse(req.body);

    const result = await query(
      `
        UPDATE calls
        SET
          outcome = COALESCE($2, outcome),
          notes = COALESCE($3, notes),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          ${req.user.role === 'manager' ? '' : 'AND agent_id = $4'}
        RETURNING *
      `,
      req.user.role === 'manager'
        ? [params.id, payload.outcome ?? null, payload.notes ?? null]
        : [params.id, payload.outcome ?? null, payload.notes ?? null, req.user.id]
    );

    if (result.rowCount === 0) {
      throw new AppError('Call not found', 404);
    }

    const call = result.rows[0];

    // Omnichannel Fallback Logic: if outcome is no_answer, move to social
    if (call.outcome === 'no_answer' && call.contact_id) {
      await query(
        `UPDATE contacts SET omnichannel_stage = 'social', updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND omnichannel_stage = 'calling'`,
        [call.contact_id]
      );
    }

    emitToAgent(call.agent_id, 'call.updated', { call, source: 'manual-disposition' });
    res.json({ call });
  })
);

router.post(
  '/:id/recording',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    const payload = z.object({
      action: z.enum(['start', 'stop'])
    }).parse(req.body);

    const call = await fetchCallByIdentifier({ id: params.id });

    if (!call) {
      throw new AppError('Call not found', 404);
    }
    if (req.user.role !== 'manager' && Number(call.agent_id) !== Number(req.user.id)) {
      throw new AppError('You can only manage recordings for your own calls', 403);
    }

    if (payload.action === 'start') {
      const recording = await twilioClient.calls(call.call_sid).recordings.create({
        recordingStatusCallback: absoluteUrl(req, '/api/webhooks/call-status'),
        recordingStatusCallbackMethod: 'POST',
        recordingChannels: 'mono',
        recordingTrack: 'both'
      });

      const updated = await query(
        `
          UPDATE calls
          SET
            recording_sid = $2,
            recording_status = $3,
            recording_enabled = true,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          RETURNING *
        `,
        [call.id, recording.sid, recording.status]
      );

      emitToAgent(call.agent_id, 'call.updated', {
        call: updated.rows[0],
        source: 'recording-start'
      });

      return res.json({
        call: updated.rows[0],
        recording
      });
    }

    const recording = await twilioClient.calls(call.call_sid).recordings('Twilio.CURRENT').update({
      status: 'stopped'
    });

    const updated = await query(
      `
        UPDATE calls
        SET
          recording_status = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `,
      [call.id, recording.status]
    );

    emitToAgent(call.agent_id, 'call.updated', {
      call: updated.rows[0],
      source: 'recording-stop'
    });

    return res.json({
      call: updated.rows[0],
      recording
    });
  })
);

router.get(
  '/:id/recording/stream',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      id: z.coerce.number().int().positive()
    }).parse(req.params);

    const call = await fetchCallByIdentifier({ id: params.id });

    if (!call || !call.recording_url) {
      throw new AppError('Recording not found', 404);
    }
    if (req.user.role !== 'manager' && Number(call.agent_id) !== Number(req.user.id)) {
      throw new AppError('You can only play recordings for your own calls', 403);
    }

    // Proxy the recording from Twilio to avoid the Basic Auth popup in browser
    const response = await axios({
      method: 'get',
      url: call.recording_url,
      responseType: 'stream',
      auth: {
        username: env.TWILIO_ACCOUNT_SID,
        password: env.TWILIO_AUTH_TOKEN
      }
    });

    res.setHeader('Content-Type', 'audio/mpeg');
    response.data.pipe(res);
  })
);

router.post(
  '/:callSid/transfer',
  requireAuth,
  asyncHandler(async (req, res) => {
    const params = z.object({
      callSid: z.string().min(1)
    }).parse(req.params);

    const payload = z.object({
      targetAgentId: z.coerce.number().int().positive()
    }).parse(req.body);

    const targetAgentResult = await query(
      `SELECT id, twilio_identity FROM agents WHERE id = $1 AND is_available = true AND status = 'active' LIMIT 1`,
      [payload.targetAgentId]
    );

    const targetAgent = targetAgentResult.rows[0];
    if (!targetAgent) {
      throw new AppError('Target closer is not available or does not exist', 400);
    }

    if (!targetAgent.twilio_identity) {
      throw new AppError('Target closer does not have a Twilio identity setup', 400);
    }

    const callRecord = await query(
      `SELECT id, call_sid, child_call_sid FROM calls WHERE call_sid = $1 OR child_call_sid = $1 LIMIT 1`,
      [params.callSid]
    );

    if (callRecord.rows.length === 0) {
      throw new AppError('Call record not found in database', 404);
    }

    // Always transfer the parent call (the customer's leg)
    const parentCallSid = callRecord.rows[0].call_sid;

    const response = new twilio.twiml.VoiceResponse();
    response.say({ voice: 'alice' }, 'Please hold while we transfer your call.');
    const dial = response.dial({ answerOnBridge: true });
    dial.client(targetAgent.twilio_identity);

    await twilioClient.calls(parentCallSid).update({
      twiml: response.toString()
    });

    res.json({ success: true, message: 'Call transferred successfully' });
  })
);

export default router;

import { Router } from 'express';
import { query } from '../db/index.js';
import { asyncHandler, AppError } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Used by Chrome Extension to get the next pending task
router.get(
  '/next-task',
  requireAuth,
  asyncHandler(async (req, res) => {
    const agentId = req.user.id;

    // Reset daily limit if it's a new day
    await query(`
      UPDATE agents 
      SET facebook_connections_sent_today = 0, facebook_last_reset_date = CURRENT_DATE 
      WHERE id = $1 AND (facebook_last_reset_date IS NULL OR facebook_last_reset_date < CURRENT_DATE)
    `, [agentId]);

    // Check if limit reached
    const { rows: agentRows } = await query(`
      SELECT facebook_daily_limit, facebook_connection_template, facebook_connections_sent_today 
      FROM agents WHERE id = $1
    `, [agentId]);

    const agent = agentRows[0];
    if (!agent) throw new AppError('Agent not found', 404);

    if (agent.facebook_connections_sent_today >= (agent.facebook_daily_limit || 30)) {
      return res.json({ task: null, message: 'Daily limit reached' });
    }

    // Get the oldest pending task
    const { rows: tasks } = await query(`
      SELECT t.id, t.task_type, t.contact_id, c.facebook as profile_url, c.name
      FROM facebook_tasks t
      JOIN contacts c ON t.contact_id = c.id
      WHERE t.agent_id = $1 AND t.status = 'pending' AND c.facebook IS NOT NULL
      ORDER BY t.created_at ASC
      LIMIT 1
    `, [agentId]);

    if (tasks.length === 0) {
      return res.json({ task: null, message: 'No pending tasks' });
    }

    // Return task with template
    const task = tasks[0];
    res.json({
      task: {
        id: task.id,
        type: task.task_type,
        contact_id: task.contact_id,
        profile_url: task.profile_url,
        name: task.name,
        template: agent.facebook_connection_template || 'Hi {name}, I noticed your profile and would love to connect.'
      }
    });
  })
);

// Used by Chrome Extension to mark a task as completed
router.post(
  '/complete-task',
  requireAuth,
  asyncHandler(async (req, res) => {
    const agentId = req.user.id;
    const { task_id } = req.body;

    if (!task_id) throw new AppError('Task ID required', 400);

    await query('BEGIN');
    
    // Update task
    const { rowCount } = await query(`
      UPDATE facebook_tasks 
      SET status = 'completed', updated_at = NOW() 
      WHERE id = $1 AND agent_id = $2
    `, [task_id, agentId]);

    if (rowCount > 0) {
      // Increment sent count
      await query(`
        UPDATE agents 
        SET facebook_connections_sent_today = facebook_connections_sent_today + 1 
        WHERE id = $1
      `, [agentId]);
    }

    await query('COMMIT');
    res.json({ success: true });
  })
);

router.get(
  '/tasks',
  requireAuth,
  asyncHandler(async (req, res) => {
    const agentId = req.user.id;
    const { rows: tasks } = await query(`
      SELECT t.id, t.task_type, t.status, t.created_at, t.updated_at, c.name, c.facebook as profile_url
      FROM facebook_tasks t
      JOIN contacts c ON t.contact_id = c.id
      WHERE t.agent_id = $1
      ORDER BY t.created_at DESC
    `, [agentId]);
    res.json({ tasks });
  })
);

router.get(
  '/manual-stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    const agentId = req.user.id;

    // Reset daily limits if it's a new day
    await query(`
      UPDATE agents 
      SET fb_likes_done_today = 0, fb_comments_done_today = 0, fb_groups_done_today = 0, facebook_last_reset_date = CURRENT_DATE 
      WHERE id = $1 AND (facebook_last_reset_date IS NULL OR facebook_last_reset_date < CURRENT_DATE)
    `, [agentId]);

    const { rows: agentRows } = await query(`
      SELECT 
        fb_daily_likes_target, fb_likes_done_today,
        fb_daily_comments_target, fb_comments_done_today,
        fb_daily_groups_target, fb_groups_done_today
      FROM agents WHERE id = $1
    `, [agentId]);

    if (!agentRows[0]) throw new AppError('Agent not found', 404);
    res.json({ stats: agentRows[0] });
  })
);

router.post(
  '/log-manual-activity',
  requireAuth,
  asyncHandler(async (req, res) => {
    const agentId = req.user.id;
    const { activity_type } = req.body; // 'like', 'comment', or 'group'

    if (!['like', 'comment', 'group'].includes(activity_type)) {
      throw new AppError('Invalid activity type', 400);
    }

    let updateCol = '';
    if (activity_type === 'like') updateCol = 'fb_likes_done_today';
    if (activity_type === 'comment') updateCol = 'fb_comments_done_today';
    if (activity_type === 'group') updateCol = 'fb_groups_done_today';

    await query(`
      UPDATE agents 
      SET ${updateCol} = ${updateCol} + 1 
      WHERE id = $1
    `, [agentId]);

    res.json({ success: true });
  })
);

export default router;

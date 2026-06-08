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
      SET reddit_connections_sent_today = 0, reddit_last_reset_date = CURRENT_DATE 
      WHERE id = $1 AND (reddit_last_reset_date IS NULL OR reddit_last_reset_date < CURRENT_DATE)
    `, [agentId]);

    // Check if limit reached
    const { rows: agentRows } = await query(`
      SELECT reddit_daily_limit, reddit_connection_template, reddit_connections_sent_today 
      FROM agents WHERE id = $1
    `, [agentId]);

    const agent = agentRows[0];
    if (!agent) throw new AppError('Agent not found', 404);

    if (agent.reddit_connections_sent_today >= agent.reddit_daily_limit) {
      return res.json({ task: null, message: 'Daily limit reached' });
    }

    // Get the oldest pending task
    const { rows: tasks } = await query(`
      SELECT t.id, t.task_type, t.contact_id, c.reddit_url, c.name
      FROM reddit_tasks t
      JOIN contacts c ON t.contact_id = c.id
      WHERE t.agent_id = $1 AND t.status = 'pending' AND c.reddit_url IS NOT NULL
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
        profile_url: task.reddit_url,
        name: task.name,
        template: agent.reddit_connection_template || 'Hi {name}, I saw your post and wanted to connect.'
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
      UPDATE reddit_tasks 
      SET status = 'completed', updated_at = NOW() 
      WHERE id = $1 AND agent_id = $2
    `, [task_id, agentId]);

    if (rowCount > 0) {
      // Increment sent count
      await query(`
        UPDATE agents 
        SET reddit_connections_sent_today = reddit_connections_sent_today + 1 
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
      SELECT t.id, t.task_type, t.status, t.created_at, t.updated_at, c.name, c.reddit_url as profile_url
      FROM reddit_tasks t
      JOIN contacts c ON t.contact_id = c.id
      WHERE t.agent_id = $1
      ORDER BY t.created_at DESC
    `, [agentId]);
    res.json({ tasks });
  })
);

export default router;

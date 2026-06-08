import { Router } from 'express';
import { query } from '../db/index.js';
import { asyncHandler } from '../utils/errors.js';
import { requireManagerOrLeader } from '../middleware/auth.js';

const router = Router();

router.get(
  '/leaderboard',
  requireManagerOrLeader,
  asyncHandler(async (req, res) => {
    const period = req.query.period || 'today'; // 'today', 'week', 'month'
    let dateFilter = "CURRENT_DATE";
    if (period === 'week') {
        dateFilter = "CURRENT_DATE - INTERVAL '7 days'";
    } else if (period === 'month') {
        dateFilter = "CURRENT_DATE - INTERVAL '30 days'";
    }

    const result = await query(`
        SELECT 
            a.id, a.name, a.twilio_phone_number,
            t.name as team_name,
            COALESCE(c.total_calls, 0) as total_calls,
            COALESCE(c.connected_calls, 0) as connected_calls,
            COALESCE(c.total_seconds, 0) as total_seconds,
            COALESCE(l.leads_generated, 0) as leads_generated
        FROM agents a
        LEFT JOIN teams t ON a.team_id = t.id
        LEFT JOIN (
            SELECT agent_id,
                   COUNT(*) as total_calls,
                   SUM(CASE WHEN outcome = 'connected' THEN 1 ELSE 0 END) as connected_calls,
                   SUM(COALESCE(duration_seconds, 0)) as total_seconds
            FROM calls
            WHERE started_at::date >= ${dateFilter}
            GROUP BY agent_id
        ) c ON c.agent_id = a.id
        LEFT JOIN (
            SELECT assigned_agent_id, COUNT(*) as leads_generated
            FROM contacts
            WHERE created_at::date >= ${dateFilter}
            GROUP BY assigned_agent_id
        ) l ON l.assigned_agent_id = a.id
        WHERE a.role IN ('employee', 'team_leader')
        ORDER BY leads_generated DESC, connected_calls DESC
    `);

    res.json({ leaderboard: result.rows });
  })
);

export default router;

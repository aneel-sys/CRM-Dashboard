const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const TIMELOGS_TABLE = 'project_time_logs'; // fallback handled in helper

async function queryTimelogs(pool, tbl, extraWhere, params) {
  try {
    const [rows] = await pool.query(
      `SELECT tl.id, u.id as user_id, u.name as employee_name,
              p.project_name, t.heading as task_name,
              tl.total_hours, tl.memo as notes,
              DATE_FORMAT(tl.created_at, '%Y-%m-%d') as log_date, tl.created_at
       FROM ${tbl(TIMELOGS_TABLE)} tl
       JOIN ${tbl('users')} u ON u.id = tl.user_id
       LEFT JOIN ${tbl('projects')} p ON p.id = tl.project_id
       LEFT JOIN ${tbl('tasks')} t ON t.id = tl.task_id
       WHERE 1=1 ${extraWhere}
       ORDER BY tl.created_at DESC`,
      params
    );
    return rows;
  } catch {
    const [rows] = await pool.query(
      `SELECT tl.id, u.id as user_id, u.name as employee_name,
              p.project_name, t.heading as task_name,
              tl.total_hours, tl.memo as notes,
              DATE_FORMAT(tl.created_at, '%Y-%m-%d') as log_date, tl.created_at
       FROM ${tbl('timelogs')} tl
       JOIN ${tbl('users')} u ON u.id = tl.user_id
       LEFT JOIN ${tbl('projects')} p ON p.id = tl.project_id
       LEFT JOIN ${tbl('tasks')} t ON t.id = tl.task_id
       WHERE 1=1 ${extraWhere}
       ORDER BY tl.created_at DESC`,
      params
    );
    return rows;
  }
}

// GET /api/timings?from=&to=&user_id=&project_id=
router.get('/', requireAuth, async (req, res) => {
  try {
    const { from, to, user_id, project_id } = req.query;
    const params = [];
    let where = '';

    if (from) { where += ' AND DATE(tl.created_at) >= ?'; params.push(from); }
    if (to) { where += ' AND DATE(tl.created_at) <= ?'; params.push(to); }
    if (user_id) { where += ' AND tl.user_id = ?'; params.push(user_id); }
    if (project_id) { where += ' AND tl.project_id = ?'; params.push(project_id); }

    const rows = await queryTimelogs(pool, tbl, where, params);

    const totalHours = rows.reduce((s, r) => s + (parseFloat(r.total_hours) || 0), 0);
    const uniqueEmployees = new Set(rows.map(r => r.user_id)).size;
    const uniqueDays = new Set(rows.map(r => r.log_date)).size;

    res.json({
      success: true,
      logs: rows,
      summary: {
        totalHours: totalHours.toFixed(2),
        avgPerEmployee: uniqueEmployees ? (totalHours / uniqueEmployees).toFixed(2) : '0.00',
        avgPerDay: uniqueDays ? (totalHours / uniqueDays).toFixed(2) : '0.00',
        totalEntries: rows.length,
      },
    });
  } catch (err) {
    console.error('Timings error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/timings/export?from=&to=&user_id=&project_id=
router.get('/export', requireAuth, async (req, res) => {
  try {
    const { from, to, user_id, project_id } = req.query;
    const params = [];
    let where = '';

    if (from) { where += ' AND DATE(tl.created_at) >= ?'; params.push(from); }
    if (to) { where += ' AND DATE(tl.created_at) <= ?'; params.push(to); }
    if (user_id) { where += ' AND tl.user_id = ?'; params.push(user_id); }
    if (project_id) { where += ' AND tl.project_id = ?'; params.push(project_id); }

    const rows = await queryTimelogs(pool, tbl, where, params);

    const headers = ['Employee', 'Date', 'Project', 'Task', 'Hours', 'Notes'];
    const csvRows = rows.map(r => [
      `"${r.employee_name}"`,
      `"${r.log_date}"`,
      `"${r.project_name || ''}"`,
      `"${r.task_name || ''}"`,
      r.total_hours || 0,
      `"${(r.notes || '').replace(/"/g, "'")}"`,
    ]);

    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="timings_export.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/timings/filters — return employees + projects for filter dropdowns
router.get('/filters', requireAuth, async (req, res) => {
  try {
    const [employees] = await pool.query(
      `SELECT id, name FROM ${tbl('users')} WHERE status = 'active' ORDER BY name`
    );
    const [projects] = await pool.query(
      `SELECT id, project_name as name FROM ${tbl('projects')} ORDER BY project_name`
    );
    res.json({ success: true, employees, projects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

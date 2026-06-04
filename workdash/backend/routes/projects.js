const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

// GET /api/projects?status=active&search=
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, search } = req.query;
    const params = [];
    let where = 'WHERE 1=1';

    if (status && status !== 'all') {
      where += ' AND p.status = ?';
      params.push(status);
    }
    if (search) {
      where += ' AND p.project_name LIKE ?';
      params.push(`%${search}%`);
    }

    const [projects] = await pool.query(
      `SELECT p.id, p.project_name as name, p.status, p.deadline, p.created_at,
              c.company_name as client_name,
              COUNT(DISTINCT pm.user_id) as member_count,
              COUNT(DISTINCT t.id) as total_tasks,
              COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks
       FROM ${tbl('projects')} p
       LEFT JOIN ${tbl('clients')} c ON c.id = p.client_id
       LEFT JOIN ${tbl('project_members')} pm ON pm.project_id = p.id
       LEFT JOIN ${tbl('tasks')} t ON t.project_id = p.id
       ${where}
       GROUP BY p.id, p.project_name, p.status, p.deadline, p.created_at, c.company_name
       ORDER BY p.created_at DESC`,
      params
    );

    // Get hours per project
    let hoursMap = {};
    try {
      const [hours] = await pool.query(
        `SELECT project_id, COALESCE(SUM(total_hours), 0) as hours
         FROM ${tbl('project_time_logs')}
         GROUP BY project_id`
      );
      hours.forEach(h => { hoursMap[h.project_id] = parseFloat(h.hours) || 0; });
    } catch {
      try {
        const [hours] = await pool.query(
          `SELECT project_id, COALESCE(SUM(total_hours), 0) as hours
           FROM ${tbl('timelogs')} GROUP BY project_id`
        );
        hours.forEach(h => { hoursMap[h.project_id] = parseFloat(h.hours) || 0; });
      } catch {}
    }

    const result = projects.map(p => ({
      ...p,
      hours_logged: hoursMap[p.id] || 0,
      completion_pct: p.total_tasks
        ? Math.round((p.completed_tasks / p.total_tasks) * 100)
        : 0,
    }));

    res.json({ success: true, projects: result });
  } catch (err) {
    console.error('Projects error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/projects/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [[project]] = await pool.query(
      `SELECT p.id, p.project_name as name, p.status, p.deadline, p.created_at,
              c.company_name as client_name,
              COUNT(DISTINCT pm.user_id) as member_count,
              COUNT(DISTINCT t.id) as total_tasks,
              COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tasks
       FROM ${tbl('projects')} p
       LEFT JOIN ${tbl('clients')} c ON c.id = p.client_id
       LEFT JOIN ${tbl('project_members')} pm ON pm.project_id = p.id
       LEFT JOIN ${tbl('tasks')} t ON t.project_id = p.id
       WHERE p.id = ?
       GROUP BY p.id, p.project_name, p.status, p.deadline, p.created_at, c.company_name`,
      [id]
    );

    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    let totalHours = 0;
    try {
      const [[row]] = await pool.query(
        `SELECT COALESCE(SUM(total_hours), 0) as hours FROM ${tbl('project_time_logs')} WHERE project_id = ?`, [id]
      );
      totalHours = parseFloat(row.hours) || 0;
    } catch {
      try {
        const [[row]] = await pool.query(
          `SELECT COALESCE(SUM(total_hours), 0) as hours FROM ${tbl('timelogs')} WHERE project_id = ?`, [id]
        );
        totalHours = parseFloat(row.hours) || 0;
      } catch {}
    }

    res.json({
      success: true,
      project: {
        ...project,
        hours_logged: totalHours,
        completion_pct: project.total_tasks
          ? Math.round((project.completed_tasks / project.total_tasks) * 100)
          : 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/projects/:id/members?month=5&year=2025
router.get('/:id/members', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const [members] = await pool.query(
      `SELECT u.id, u.name,
              d.team_name as department,
              ds.name as designation
       FROM ${tbl('project_members')} pm
       JOIN ${tbl('users')} u ON u.id = pm.user_id
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
       WHERE pm.project_id = ?`,
      [id]
    );

    // Hours per member this month
    let memberHours = {};
    try {
      const [rows] = await pool.query(
        `SELECT user_id, COALESCE(SUM(total_hours), 0) as hours
         FROM ${tbl('project_time_logs')}
         WHERE project_id = ?
           AND MONTH(created_at) = ? AND YEAR(created_at) = ?
         GROUP BY user_id`,
        [id, month, year]
      );
      rows.forEach(r => { memberHours[r.user_id] = parseFloat(r.hours) || 0; });
    } catch {
      try {
        const [rows] = await pool.query(
          `SELECT user_id, COALESCE(SUM(total_hours), 0) as hours
           FROM ${tbl('timelogs')}
           WHERE project_id = ?
             AND MONTH(created_at) = ? AND YEAR(created_at) = ?
           GROUP BY user_id`,
          [id, month, year]
        );
        rows.forEach(r => { memberHours[r.user_id] = parseFloat(r.hours) || 0; });
      } catch {}
    }

    const result = members.map(m => ({ ...m, hours: memberHours[m.id] || 0 }));
    res.json({ success: true, members: result, month, year });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/projects/:id/tasks
router.get('/:id/tasks', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const [tasks] = await pool.query(
      `SELECT id, heading as title, status, due_date, created_at
       FROM ${tbl('tasks')} WHERE project_id = ? ORDER BY created_at DESC`,
      [id]
    );
    res.json({ success: true, tasks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

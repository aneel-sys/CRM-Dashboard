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

    // Base project list — no client join (resolved separately below)
    const [projects] = await pool.query(
      `SELECT p.id, p.project_name as name, p.status, p.deadline, p.created_at,
              p.client_id
       FROM ${tbl('projects')} p
       ${where}
       ORDER BY p.created_at DESC`,
      params
    );

    // Resolve client names — try client_details first, then clients, then companies
    let clientMap = {};
    for (const clientTable of ['client_details', 'clients', 'companies']) {
      try {
        const [rows] = await pool.query(
          `SELECT id, COALESCE(company_name, name) as company_name FROM ${tbl(clientTable)}`
        );
        rows.forEach(r => { clientMap[r.id] = r.company_name; });
        break; // stop on first success
      } catch { }
    }

    const ids = projects.map(p => p.id);

    // Member counts per project
    let memberMap = {};
    if (ids.length) {
      try {
        const [rows] = await pool.query(
          `SELECT project_id, COUNT(DISTINCT user_id) as cnt
           FROM ${tbl('project_members')} WHERE project_id IN (?)
           GROUP BY project_id`, [ids]
        );
        rows.forEach(r => { memberMap[r.project_id] = r.cnt; });
      } catch { }
    }

    // Task counts per project
    let taskMap = {}, doneMap = {};
    if (ids.length) {
      try {
        const [rows] = await pool.query(
          `SELECT project_id,
                  COUNT(*) as total,
                  SUM(CASE WHEN status IN ('complete','completed','done') THEN 1 ELSE 0 END) as done
           FROM ${tbl('tasks')} WHERE project_id IN (?)
           GROUP BY project_id`, [ids]
        );
        rows.forEach(r => { taskMap[r.project_id] = r.total; doneMap[r.project_id] = r.done; });
      } catch { }
    }

    // Hours per project
    let hoursMap = {};
    if (ids.length) {
      try {
        const [rows] = await pool.query(
          `SELECT project_id, COALESCE(SUM(total_hours), 0) as hours
           FROM ${tbl('project_time_logs')} WHERE project_id IN (?)
           GROUP BY project_id`, [ids]
        );
        rows.forEach(r => { hoursMap[r.project_id] = parseFloat(r.hours) || 0; });
      } catch {
        try {
          const [rows] = await pool.query(
            `SELECT project_id, COALESCE(SUM(total_hours), 0) as hours
             FROM ${tbl('timelogs')} WHERE project_id IN (?)
             GROUP BY project_id`, [ids]
          );
          rows.forEach(r => { hoursMap[r.project_id] = parseFloat(r.hours) || 0; });
        } catch { }
      }
    }

    // Last time log date per active project (for stale detection)
    let lastLogMap = {};
    const activeIds = projects
      .filter(p => !['completed', 'canceled', 'cancelled'].includes((p.status || '').toLowerCase()))
      .map(p => p.id);
    if (activeIds.length) {
      try {
        const [rows] = await pool.query(
          `SELECT project_id, MAX(created_at) as last_log
           FROM ${tbl('project_time_logs')} WHERE project_id IN (?)
           GROUP BY project_id`, [activeIds]
        );
        rows.forEach(r => { lastLogMap[r.project_id] = r.last_log; });
      } catch {
        try {
          const [rows] = await pool.query(
            `SELECT project_id, MAX(created_at) as last_log
             FROM ${tbl('timelogs')} WHERE project_id IN (?)
             GROUP BY project_id`, [activeIds]
          );
          rows.forEach(r => { lastLogMap[r.project_id] = r.last_log; });
        } catch { }
      }
    }

    const STALE_DAYS = 14;
    const now = Date.now();

    const result = projects.map(p => {
      const total = taskMap[p.id] || 0;
      const done = doneMap[p.id] || 0;
      const isActive = !['completed', 'canceled', 'cancelled'].includes((p.status || '').toLowerCase());
      const lastLog = lastLogMap[p.id];
      const daysSinceLast = lastLog
        ? (now - new Date(lastLog).getTime()) / 86400000
        : (now - new Date(p.created_at).getTime()) / 86400000;
      const is_stale = isActive && daysSinceLast > STALE_DAYS;

      return {
        ...p,
        client_name: clientMap[p.client_id] || null,
        member_count: memberMap[p.id] || 0,
        total_tasks: total,
        completed_tasks: done,
        hours_logged: hoursMap[p.id] || 0,
        completion_pct: total ? Math.round((done / total) * 100) : 0,
        is_stale,
      };
    });

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
      `SELECT p.id, p.project_name as name, p.status, p.deadline, p.created_at, p.client_id
       FROM ${tbl('projects')} p WHERE p.id = ?`,
      [id]
    );

    if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });

    // Resolve client name
    let client_name = null;
    if (project.client_id) {
      for (const t of ['client_details', 'clients', 'companies']) {
        try {
          const [[r]] = await pool.query(
            `SELECT COALESCE(company_name, name) as n FROM ${tbl(t)} WHERE id = ?`, [project.client_id]
          );
          if (r) { client_name = r.n; break; }
        } catch { }
      }
    }

    let member_count = 0, total_tasks = 0, completed_tasks = 0, totalHours = 0;

    try {
      const [[r]] = await pool.query(
        `SELECT COUNT(DISTINCT user_id) as cnt FROM ${tbl('project_members')} WHERE project_id = ?`, [id]
      );
      member_count = r.cnt;
    } catch { }

    try {
      const [[r]] = await pool.query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN status IN ('complete','completed','done') THEN 1 ELSE 0 END) as done
         FROM ${tbl('tasks')} WHERE project_id = ?`, [id]
      );
      total_tasks = r.total; completed_tasks = r.done || 0;
    } catch { }

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
      } catch { }
    }

    res.json({
      success: true,
      project: {
        ...project,
        client_name,
        member_count,
        total_tasks,
        completed_tasks,
        hours_logged: totalHours,
        completion_pct: total_tasks ? Math.round((completed_tasks / total_tasks) * 100) : 0,
      },
    });
  } catch (err) {
    console.error('Project detail error:', err.message);
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
      } catch { }
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

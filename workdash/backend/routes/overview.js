const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { getOfficeStartTime } = require('../db/officeSettings');
const { requireAuth } = require('../middleware/auth');

let cache = { data: null, ts: 0 };
const CACHE_TTL = 30 * 1000;

// GET /api/overview/today
router.get('/today', requireAuth, async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && now - cache.ts < CACHE_TTL) {
      return res.json({ success: true, ...cache.data });
    }

    const today = new Date().toISOString().slice(0, 10);
    const officeStart = await getOfficeStartTime();

    // Total active employees
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM ${tbl('users')} WHERE status = 'active'`
    );

    // Present today
    const [[{ present }]] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as present FROM ${tbl('attendances')}
       WHERE DATE(clock_in_time) = ?`,
      [today]
    );

    // Late today
    const [[{ late }]] = await pool.query(
      `SELECT COUNT(*) as late FROM ${tbl('attendances')}
       WHERE DATE(clock_in_time) = ? AND TIME(clock_in_time) > ?`,
      [today, officeStart]
    );

    const absent = total - present;

    // On leave today
    let on_leave = 0;
    try {
      const [[row]] = await pool.query(
        `SELECT COUNT(*) as on_leave FROM ${tbl('leaves')}
         WHERE DATE(leave_date) = ? AND status = 'approved'`,
        [today]
      );
      on_leave = row.on_leave || 0;
    } catch { on_leave = 0; }

    // Currently working: clocked in today, no clock-out yet
    let currentlyWorking = { count: 0, list: [] };
    try {
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(DISTINCT a.user_id) as count
         FROM ${tbl('attendances')} a
         WHERE DATE(a.clock_in_time) = ?
           AND a.clock_in_time IS NOT NULL
           AND a.clock_out_time IS NULL`,
        [today]
      );
      const [list] = await pool.query(
        `SELECT u.id, u.name, a.clock_in_time
         FROM ${tbl('attendances')} a
         JOIN ${tbl('users')} u ON u.id = a.user_id
         WHERE DATE(a.clock_in_time) = ?
           AND a.clock_in_time IS NOT NULL
           AND a.clock_out_time IS NULL
         ORDER BY a.clock_in_time ASC
         LIMIT 8`,
        [today]
      );
      currentlyWorking = { count, list };
    } catch { }

    // Department breakdown: present/late/absent per team
    let deptBreakdown = [];
    try {
      const [rows] = await pool.query(
        `SELECT
           d.team_name AS department,
           COUNT(DISTINCT u.id) AS total,
           COUNT(DISTINCT CASE WHEN a.clock_in_time IS NOT NULL THEN u.id END) AS present,
           COUNT(DISTINCT CASE WHEN a.clock_in_time IS NOT NULL AND TIME(a.clock_in_time) > ? THEN u.id END) AS late
         FROM ${tbl('users')} u
         LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
         LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
         LEFT JOIN ${tbl('attendances')} a
           ON a.user_id = u.id AND DATE(a.clock_in_time) = ?
         WHERE u.status = 'active' AND d.id IS NOT NULL
         GROUP BY d.id, d.team_name
         ORDER BY present DESC
         LIMIT 8`,
        [officeStart, today]
      );
      deptBreakdown = rows.map(r => ({
        department: r.department,
        total: r.total,
        present: r.present,
        late: r.late,
        absent: r.total - r.present,
      }));
    } catch { }

    // Hours this month
    let monthHours = 0;
    try {
      const [[row]] = await pool.query(
        `SELECT COALESCE(SUM(total_hours), 0) as hours FROM ${tbl('project_time_logs')}
         WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())`
      );
      monthHours = parseFloat(row.hours) || 0;
    } catch {
      try {
        const [[row]] = await pool.query(
          `SELECT COALESCE(SUM(total_hours), 0) as hours FROM ${tbl('timelogs')}
           WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())`
        );
        monthHours = parseFloat(row.hours) || 0;
      } catch { }
    }

    // Active projects
    const [[{ activeProjects }]] = await pool.query(
      `SELECT COUNT(*) as activeProjects FROM ${tbl('projects')} WHERE status NOT IN ('completed', 'canceled')`
    );

    // Late arrivals detail
    const [lateArrivals] = await pool.query(
      `SELECT u.id, u.name, u.email,
              d.team_name as department,
              ds.name as designation,
              a.clock_in_time, a.clock_out_time,
              TIMESTAMPDIFF(MINUTE, CONCAT(DATE(a.clock_in_time), ' ', ?), a.clock_in_time) as delay_minutes
       FROM ${tbl('attendances')} a
       JOIN ${tbl('users')} u ON u.id = a.user_id
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
       WHERE DATE(a.clock_in_time) = ? AND TIME(a.clock_in_time) > ?
       ORDER BY a.clock_in_time ASC
       LIMIT 20`,
      [officeStart, today, officeStart]
    );

    // Top 5 workers this month
    let topWorkers = [];
    try {
      const [rows] = await pool.query(
        `SELECT u.id, u.name,
                COALESCE(SUM(tl.total_hours), 0) as total_hours
         FROM ${tbl('users')} u
         LEFT JOIN ${tbl('project_time_logs')} tl ON tl.user_id = u.id
           AND MONTH(tl.created_at) = MONTH(CURDATE()) AND YEAR(tl.created_at) = YEAR(CURDATE())
         WHERE u.status = 'active'
         GROUP BY u.id, u.name
         ORDER BY total_hours DESC
         LIMIT 5`
      );
      topWorkers = rows;
    } catch {
      try {
        const [rows] = await pool.query(
          `SELECT u.id, u.name,
                  COALESCE(SUM(tl.total_hours), 0) as total_hours
           FROM ${tbl('users')} u
           LEFT JOIN ${tbl('timelogs')} tl ON tl.user_id = u.id
             AND MONTH(tl.created_at) = MONTH(CURDATE()) AND YEAR(tl.created_at) = YEAR(CURDATE())
           WHERE u.status = 'active'
           GROUP BY u.id, u.name
           ORDER BY total_hours DESC
           LIMIT 5`
        );
        topWorkers = rows;
      } catch { }
    }

    // Weekly hours
    let weeklyHours = [];
    try {
      const [rows] = await pool.query(
        `SELECT CEIL(DAY(created_at) / 7) as week, COALESCE(SUM(total_hours), 0) as hours
         FROM ${tbl('project_time_logs')}
         WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())
         GROUP BY week ORDER BY week`
      );
      weeklyHours = rows;
    } catch {
      try {
        const [rows] = await pool.query(
          `SELECT CEIL(DAY(created_at) / 7) as week, COALESCE(SUM(total_hours), 0) as hours
           FROM ${tbl('timelogs')}
           WHERE MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())
           GROUP BY week ORDER BY week`
        );
        weeklyHours = rows;
      } catch { }
    }

    const data = {
      date: today,
      stats: {
        total, present, late, absent,
        onLeave: on_leave,
        monthHours: monthHours.toFixed(1),
        activeProjects,
      },
      lateArrivals,
      topWorkers,
      weeklyHours,
      attendanceBreakdown: {
        present: present - on_leave,
        onLeave: on_leave,
        absent,
      },
      currentlyWorking,
      deptBreakdown,
    };

    cache = { data, ts: Date.now() };
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Overview error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

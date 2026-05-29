const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

// Simple in-memory cache
let cache = { data: null, ts: 0 };
const CACHE_TTL = 30 * 1000; // 30 seconds

// GET /api/overview/today
router.get('/today', requireAuth, async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && now - cache.ts < CACHE_TTL) {
      return res.json({ success: true, ...cache.data });
    }

    const today = new Date().toISOString().slice(0, 10);
    const officeStart = process.env.OFFICE_START_TIME || '09:00';

    // Total active employees
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM ${tbl('users')} WHERE status = 'active'`
    );

    // Present today (have a clock_in)
    const [[{ present }]] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as present FROM ${tbl('attendances')}
       WHERE DATE(clock_in_time) = ?`,
      [today]
    );

    // Late today (clock_in after office start)
    const [[{ late }]] = await pool.query(
      `SELECT COUNT(*) as late FROM ${tbl('attendances')}
       WHERE DATE(clock_in_time) = ?
         AND TIME(clock_in_time) > ?`,
      [today, officeStart]
    );

    const absent = total - present;

    // Total hours this month (from project_time_logs or timelogs)
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
      } catch { monthHours = 0; }
    }

    // Active projects
    const [[{ activeProjects }]] = await pool.query(
      `SELECT COUNT(*) as activeProjects FROM ${tbl('projects')} WHERE status = 'active'`
    );

    // Late arrivals detail for today
    const [lateArrivals] = await pool.query(
      `SELECT u.id, u.name, u.email,
              d.team_name as department,
              ds.name as designation,
              a.clock_in_time, a.clock_out_time,
              TIMESTAMPDIFF(MINUTE, CONCAT(DATE(a.clock_in_time), ' ', ?), a.clock_in_time) as delay_minutes
       FROM ${tbl('attendances')} a
       JOIN ${tbl('users')} u ON u.id = a.user_id
       LEFT JOIN ${tbl('departments')} d ON d.id = u.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = u.designation_id
       WHERE DATE(a.clock_in_time) = ?
         AND TIME(a.clock_in_time) > ?
       ORDER BY a.clock_in_time ASC
       LIMIT 20`,
      [officeStart, today, officeStart]
    );

    // Top 5 workers this month by hours
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
      } catch { topWorkers = []; }
    }

    // Weekly hours breakdown (current month, 4 weeks)
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
      } catch { weeklyHours = []; }
    }

    // Attendance breakdown for donut
    const [[{ on_leave }]] = await pool.query(
      `SELECT COUNT(*) as on_leave FROM ${tbl('leaves')}
       WHERE DATE(date) = ? AND status = 'approved'`,
      [today]
    ).catch(() => [[{ on_leave: 0 }]]);

    const data = {
      date: today,
      stats: { total, present, late, absent, monthHours: monthHours.toFixed(1), activeProjects },
      lateArrivals,
      topWorkers,
      weeklyHours,
      attendanceBreakdown: {
        present: present - on_leave,
        onLeave: on_leave,
        absent,
      },
    };

    cache = { data, ts: Date.now() };
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Overview error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

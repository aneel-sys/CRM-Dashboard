const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { getOfficeSettings } = require('../db/officeSettings');
const { requireAuth } = require('../middleware/auth');

let cache = { data: null, ts: 0 };
const CACHE_TTL = 30 * 1000;

// SSE clients set
const sseClients = new Set();
function pushToClients(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  sseClients.forEach(send => send(msg));
}

// SSE endpoint — streams overview updates in real-time
router.get('/stream', (req, res) => {
  if (!req.session?.user) {
    res.status(401).end();
    return;
  }
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (msg) => res.write(msg);
  sseClients.add(send);

  // Send current cache immediately if fresh
  if (cache.data) {
    res.write(`data: ${JSON.stringify({ success: true, ...cache.data })}\n\n`);
  }

  // Heartbeat every 25s to keep connection alive
  const hb = setInterval(() => res.write(': ping\n\n'), 25_000);

  req.on('close', () => {
    sseClients.delete(send);
    clearInterval(hb);
  });
});

// GET /api/overview/today
router.get('/today', requireAuth, async (req, res) => {
  try {
    const now = Date.now();
    if (cache.data && now - cache.ts < CACHE_TTL) {
      return res.json({ success: true, ...cache.data });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { officeStart, lateMarkDuration } = await getOfficeSettings();

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

    // Late today — use Worksuite's own late column (shift-aware, respects late_mark_duration)
    const [[{ late }]] = await pool.query(
      `SELECT COUNT(*) as late FROM ${tbl('attendances')}
       WHERE DATE(clock_in_time) = ? AND late = 'yes'`,
      [today]
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
           COUNT(DISTINCT CASE WHEN a.late = 'yes' THEN u.id END) AS late
         FROM ${tbl('users')} u
         LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
         LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
         LEFT JOIN ${tbl('attendances')} a
           ON a.user_id = u.id AND DATE(a.clock_in_time) = ?
         WHERE u.status = 'active' AND d.id IS NOT NULL
         GROUP BY d.id, d.team_name
         ORDER BY present DESC
         LIMIT 8`,
        [today]
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

    // Late arrivals — top 5, delay from per-employee shift schedule (Worksuite data)
    const IST_MS = 5.5 * 60 * 60 * 1000;
    const [lateArrivals] = await pool.query(
      `SELECT u.id, u.name, u.email,
              d.team_name as department,
              ds.name as designation,
              a.clock_in_time, a.clock_out_time,
              ess.shift_start_time,
              es.late_mark_duration AS shift_late_mark
       FROM ${tbl('attendances')} a
       JOIN ${tbl('users')} u ON u.id = a.user_id
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
       LEFT JOIN ${tbl('employee_shift_schedules')} ess
         ON ess.user_id = a.user_id AND ess.date = DATE(a.clock_in_time)
       LEFT JOIN ${tbl('employee_shifts')} es ON es.id = ess.employee_shift_id
       WHERE DATE(a.clock_in_time) = ? AND a.late = 'yes'
       ORDER BY a.clock_in_time ASC
       LIMIT 5`,
      [today]
    );
    const fallbackThresh = (() => {
      const [oh, om] = officeStart.split(':').map(Number);
      return oh * 60 + om;
    })();
    for (const row of lateArrivals) {
      if (row.clock_in_time && row.shift_start_time) {
        const clockInIST = new Date(new Date(row.clock_in_time).getTime() + IST_MS);
        const clockMins = clockInIST.getUTCHours() * 60 + clockInIST.getUTCMinutes();
        const ss = new Date(row.shift_start_time);
        const shiftMins = ss.getUTCHours() * 60 + ss.getUTCMinutes();
        row.delay_minutes = Math.max(0, clockMins - shiftMins);
      } else if (row.clock_in_time) {
        const local = new Date(new Date(row.clock_in_time).getTime() + IST_MS);
        row.delay_minutes = Math.max(0, local.getUTCHours() * 60 + local.getUTCMinutes() - fallbackThresh);
      } else {
        row.delay_minutes = 0;
      }
    }

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

    // Daily hours — last 14 days
    let dailyHours = [];
    try {
      const [rows] = await pool.query(
        `SELECT DATE(created_at) as date, COALESCE(SUM(total_hours), 0) as hours
         FROM ${tbl('project_time_logs')}
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
           AND created_at <= NOW()
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
      );
      dailyHours = rows;
    } catch {
      try {
        const [rows] = await pool.query(
          `SELECT DATE(created_at) as date, COALESCE(SUM(total_hours), 0) as hours
           FROM ${tbl('timelogs')}
           WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
             AND created_at <= NOW()
           GROUP BY DATE(created_at)
           ORDER BY date ASC`
        );
        dailyHours = rows;
      } catch { }
    }

    // Daily employee count — how many distinct employees logged hours each day
    let dailyEmployees = [];
    try {
      const [rows] = await pool.query(
        `SELECT DATE(created_at) as date, COUNT(DISTINCT user_id) as employees
         FROM ${tbl('project_time_logs')}
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
           AND created_at <= NOW()
         GROUP BY DATE(created_at)
         ORDER BY date ASC`
      );
      dailyEmployees = rows;
    } catch {
      try {
        const [rows] = await pool.query(
          `SELECT DATE(created_at) as date, COUNT(DISTINCT user_id) as employees
           FROM ${tbl('timelogs')}
           WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
             AND created_at <= NOW()
           GROUP BY DATE(created_at)
           ORDER BY date ASC`
        );
        dailyEmployees = rows;
      } catch { }
    }

    // Merge employees into dailyHours
    const empMap = {};
    dailyEmployees.forEach(r => { empMap[r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10)] = Number(r.employees); });
    dailyHours = dailyHours.map(r => {
      const ds = r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date).slice(0,10);
      return { date: ds, hours: parseFloat(r.hours) || 0, employees: empMap[ds] || 0 };
    });

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
      dailyHours,
      attendanceBreakdown: {
        present: present - on_leave,
        onLeave: on_leave,
        absent,
      },
      currentlyWorking,
      deptBreakdown,
    };

    cache = { data, ts: Date.now() };
    // Push fresh data to any connected SSE clients
    pushToClients({ success: true, ...data });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Overview error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

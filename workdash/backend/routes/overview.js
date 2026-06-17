const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { getOfficeSettings } = require('../db/officeSettings');
const { requireAuth } = require('../middleware/auth');

let cache = { data: null, ts: 0, date: '' };
const CACHE_TTL = 30 * 1000;

// GET /api/overview/today?date=YYYY-MM-DD  (omit date for live today view)
router.get('/today', requireAuth, async (req, res) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);
    const targetDate = (req.query.date && req.query.date <= todayStr) ? req.query.date.slice(0, 10) : todayStr;
    const isToday = targetDate === todayStr;

    if (isToday && cache.date === todayStr && cache.data && Date.now() - cache.ts < CACHE_TTL) {
      return res.json({ success: true, ...cache.data });
    }

    const today = targetDate;
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

    // On leave today — only people who did NOT clock in. A half-day leaver who
    // came to work counts as present, not away, so onLeave is always ⊆ absent.
    let on_leave = 0;
    try {
      const [[row]] = await pool.query(
        `SELECT COUNT(DISTINCT l.user_id) as on_leave FROM ${tbl('leaves')} l
         WHERE DATE(l.leave_date) = ? AND l.status = 'approved'
           AND l.user_id NOT IN (
             SELECT DISTINCT user_id FROM ${tbl('attendances')}
             WHERE DATE(clock_in_time) = ?
           )`,
        [today, today]
      );
      on_leave = Math.min(row.on_leave || 0, absent);
    } catch { on_leave = 0; }

    // Previous working day stats — for ▲/▼ deltas on the KPI cards
    let prev = null;
    try {
      const { officeOpenDays } = await getOfficeSettings();
      const openDays = (officeOpenDays || [1, 2, 3, 4, 5]).map(d => Number(d) === 7 ? 0 : Number(d));
      let holidaySet = new Set();
      try {
        const [hrows] = await pool.query(
          `SELECT DATE_FORMAT(date, '%Y-%m-%d') as d FROM ${tbl('holidays')}
           WHERE date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) AND date < CURDATE()`
        );
        holidaySet = new Set(hrows.map(r => r.d));
      } catch {}
      // Walk back up to 14 days to find the previous working day
      let prevDate = null;
      const d = new Date(`${today}T00:00:00Z`);
      for (let i = 0; i < 14; i++) {
        d.setUTCDate(d.getUTCDate() - 1);
        const ds = d.toISOString().slice(0, 10);
        if (openDays.includes(d.getUTCDay()) && !holidaySet.has(ds)) { prevDate = ds; break; }
      }
      if (prevDate) {
        const [[p]] = await pool.query(
          `SELECT COUNT(DISTINCT user_id) as present,
                  COUNT(DISTINCT CASE WHEN late = 'yes' THEN user_id END) as late
           FROM ${tbl('attendances')} WHERE DATE(clock_in_time) = ?`,
          [prevDate]
        );
        prev = {
          date: prevDate,
          present: Number(p.present),
          late: Number(p.late),
          absent: Math.max(0, total - Number(p.present)),
        };
      }
    } catch { prev = null; }

    // Currently working (today) or clocked in (historical custom date)
    let currentlyWorking = { count: 0, list: [] };
    try {
      const clockOutCond = isToday ? 'AND a.clock_out_time IS NULL' : '';
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(DISTINCT a.user_id) as count
         FROM ${tbl('attendances')} a
         WHERE DATE(a.clock_in_time) = ? AND a.clock_in_time IS NOT NULL ${clockOutCond}`,
        [today]
      );
      const [list] = await pool.query(
        `SELECT u.id, u.name, a.clock_in_time
         FROM ${tbl('attendances')} a
         JOIN ${tbl('users')} u ON u.id = a.user_id
         WHERE DATE(a.clock_in_time) = ? AND a.clock_in_time IS NOT NULL ${clockOutCond}
         ORDER BY a.clock_in_time ASC LIMIT 8`,
        [today]
      );
      currentlyWorking = { count, list };
    } catch { }

    // Department breakdown: present/late/absent per team
    let deptBreakdown = [];
    try {
      const [rows] = await pool.query(
        `SELECT
           d.id AS dept_id,
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
        id: r.dept_id,
        department: r.department,
        total: r.total,
        present: r.present,
        late: r.late,
        absent: r.total - r.present,
      }));
    } catch { }

    // Who's away today — names of absent employees with on-leave flag
    let absentList = [];
    try {
      const [rows] = await pool.query(
        `SELECT u.id, u.name, d.team_name AS department,
                MAX(l.id IS NOT NULL) AS on_leave,
                MAX(lt.type_name)     AS leave_type
         FROM ${tbl('users')} u
         LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
         LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
         LEFT JOIN ${tbl('leaves')} l
           ON l.user_id = u.id AND DATE(l.leave_date) = ? AND l.status = 'approved'
         LEFT JOIN ${tbl('leave_types')} lt ON lt.id = l.leave_type_id
         WHERE u.status = 'active'
           AND u.id NOT IN (
             SELECT DISTINCT user_id FROM ${tbl('attendances')} WHERE DATE(clock_in_time) = ?
           )
         GROUP BY u.id, u.name, d.team_name
         ORDER BY on_leave ASC, u.name ASC
         LIMIT 10`,
        [today, today]
      );
      absentList = rows.map(r => ({
        id: r.id,
        name: r.name,
        department: r.department,
        onLeave: !!Number(r.on_leave),
        leaveType: r.leave_type,
      }));
    } catch { }

    // Hours for the month of the target date
    const _td = new Date(today + 'T00:00:00');
    const tgtMonth = _td.getMonth() + 1;
    const tgtYear  = _td.getFullYear();
    let monthHours = 0;
    try {
      const [[row]] = await pool.query(
        `SELECT COALESCE(SUM(total_hours), 0) as hours FROM ${tbl('project_time_logs')}
         WHERE MONTH(start_time) = ? AND YEAR(start_time) = ?`,
        [tgtMonth, tgtYear]
      );
      monthHours = parseFloat(row.hours) || 0;
    } catch {
      try {
        const [[row]] = await pool.query(
          `SELECT COALESCE(SUM(total_hours), 0) as hours FROM ${tbl('timelogs')}
           WHERE MONTH(created_at) = ? AND YEAR(created_at) = ?`,
          [tgtMonth, tgtYear]
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
           AND MONTH(tl.start_time) = MONTH(CURDATE()) AND YEAR(tl.start_time) = YEAR(CURDATE())
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
        `SELECT DATE(start_time) as date, COALESCE(SUM(total_hours), 0) as hours
         FROM ${tbl('project_time_logs')}
         WHERE start_time >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
           AND start_time <= NOW()
         GROUP BY DATE(start_time)
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
        `SELECT DATE(start_time) as date, COUNT(DISTINCT user_id) as employees
         FROM ${tbl('project_time_logs')}
         WHERE start_time >= DATE_SUB(CURDATE(), INTERVAL 13 DAY)
           AND start_time <= NOW()
         GROUP BY DATE(start_time)
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
      isCustomDate: !isToday,
      stats: {
        total, present, late, absent,
        onLeave: on_leave,
        monthHours: monthHours.toFixed(1),
        activeProjects,
        prev,
      },
      lateArrivals,
      topWorkers,
      dailyHours,
      attendanceBreakdown: {
        present,
        onLeave: on_leave,
        absent: Math.max(0, absent - on_leave),
      },
      currentlyWorking,
      deptBreakdown,
      absentList,
    };

    if (isToday) cache = { data, ts: Date.now(), date: todayStr };
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Overview error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/overview/project-health
router.get('/project-health', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DATEDIFF(p.deadline, CURDATE()) as days_remaining, p.deadline
       FROM ${tbl('projects')} p
       WHERE p.deleted_at IS NULL
         AND p.status NOT IN ('completed', 'canceled', 'finished', 'cancelled')`
    );
    let onTrack = 0, atRisk = 0, overdue = 0;
    rows.forEach(r => {
      if (!r.deadline) { onTrack++; return; }
      const d = Number(r.days_remaining);
      if (d < 0) overdue++;
      else if (d <= 7) atRisk++;
      else onTrack++;
    });
    res.json({ success: true, onTrack, atRisk, overdue, total: rows.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/overview/top-performers
router.get('/top-performers', requireAuth, async (req, res) => {
  try {
    let tlTable = 'project_time_logs';
    for (const t of ['project_time_logs', 'timelogs']) {
      try { await pool.query(`SELECT 1 FROM ${tbl(t)} LIMIT 1`); tlTable = t; break; } catch {}
    }

    const [rows] = await pool.query(
      `SELECT u.id, u.name,
              ROUND(COALESCE(SUM(tl.total_hours), 0), 1) as total_hours,
              COUNT(DISTINCT DATE(a.clock_in_time)) as days_present,
              COUNT(DISTINCT CASE WHEN a.late = 'yes' THEN DATE(a.clock_in_time) END) as days_late
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl(tlTable)} tl ON tl.user_id = u.id
         AND MONTH(tl.start_time) = MONTH(CURDATE()) AND YEAR(tl.start_time) = YEAR(CURDATE())
       LEFT JOIN ${tbl('attendances')} a ON a.user_id = u.id
         AND MONTH(a.clock_in_time) = MONTH(CURDATE()) AND YEAR(a.clock_in_time) = YEAR(CURDATE())
       WHERE u.status = 'active'
       GROUP BY u.id, u.name
       HAVING total_hours > 0
       ORDER BY total_hours DESC
       LIMIT 5`
    );

    // Working days so far this month (Mon–Sat)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    let workingDays = 0;
    const d = new Date(firstDay);
    while (d <= now) {
      if (d.getDay() !== 0) workingDays++;
      d.setDate(d.getDate() + 1);
    }

    const performers = rows.map(r => ({
      id: r.id,
      name: r.name,
      total_hours: parseFloat(r.total_hours) || 0,
      days_present: Number(r.days_present) || 0,
      days_late: Number(r.days_late) || 0,
      attendance_pct: workingDays > 0 ? Math.round((Number(r.days_present) / workingDays) * 100) : 0,
    }));

    res.json({ success: true, performers, workingDays });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/overview/heatmap?year=YYYY — full-year daily attendance density
router.get('/heatmap', requireAuth, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM ${tbl('users')} WHERE status = 'active'`
    );
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(DATE(clock_in_time), '%Y-%m-%d') as date,
              COUNT(DISTINCT user_id) as present
       FROM ${tbl('attendances')}
       WHERE YEAR(clock_in_time) = ?
       GROUP BY DATE(clock_in_time)
       ORDER BY date ASC`,
      [year]
    );
    const data = rows.map(r => ({
      date: String(r.date).slice(0, 10),
      present: Number(r.present),
      pct: Number(total) > 0 ? Math.round((Number(r.present) / Number(total)) * 100) : 0,
    }));
    res.json({ success: true, data, total: Number(total), year });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/overview/leave-calendar?year=YYYY&month=M — approved leaves for calendar
router.get('/leave-calendar', requireAuth, async (req, res) => {
  try {
    const now   = new Date();
    const year  = parseInt(req.query.year)  || now.getFullYear();
    const month = parseInt(req.query.month) || now.getMonth() + 1;
    let leaves = [];
    try {
      const [rows] = await pool.query(
        `SELECT DATE_FORMAT(l.leave_date, '%Y-%m-%d') as date,
                u.id as user_id, u.name, lt.type_name, lt.color, l.duration
         FROM ${tbl('leaves')} l
         JOIN ${tbl('users')} u ON u.id = l.user_id
         LEFT JOIN ${tbl('leave_types')} lt ON lt.id = l.leave_type_id
         WHERE YEAR(l.leave_date) = ? AND MONTH(l.leave_date) = ?
           AND l.status = 'approved'
         ORDER BY l.leave_date ASC, u.name ASC`,
        [year, month]
      );
      leaves = rows;
    } catch {}
    res.json({ success: true, leaves, year, month });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

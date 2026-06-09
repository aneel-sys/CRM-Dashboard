const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

// GET /api/team?month=5&year=2025&department_id=&search=
router.get('/', requireAuth, async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const departmentId = req.query.department_id || null;
    const search = req.query.search || null;

    const today = new Date().toISOString().slice(0, 10);

    // params order must match the 4 ?s in SELECT before WHERE, then dept/search
    const params = [month, year, today, today];
    let deptFilter = '';
    if (departmentId) {
      deptFilter = 'AND ed.department_id = ?';
      params.push(departmentId);
    }
    let searchFilter = '';
    if (search) {
      searchFilter = 'AND u.name LIKE ?';
      params.push(`%${search}%`);
    }

    const [employees] = await pool.query(
      `SELECT u.id, u.name, u.email,
              d.team_name as department,
              ds.name as designation,
              u.status,
              -- Monthly attendance count
              COUNT(DISTINCT CASE
                WHEN MONTH(a.clock_in_time) = ? AND YEAR(a.clock_in_time) = ?
                THEN DATE(a.clock_in_time) END) as present_days,
              -- Last clock-in
              MAX(CASE WHEN DATE(a.clock_in_time) = ? THEN a.clock_in_time END) as last_seen,
              -- Today status — use Worksuite's late column (shift-aware)
              MAX(CASE WHEN DATE(a.clock_in_time) = ?
                  THEN CASE WHEN a.late = 'yes' THEN 'Late' ELSE 'Present' END
                  END) as today_status
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('attendances')} a ON a.user_id = u.id
       LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
       WHERE u.status = 'active'
       ${deptFilter} ${searchFilter}
       GROUP BY u.id, u.name, u.email, d.team_name, ds.name, u.status
       ORDER BY u.name`,
      params
    );

    // Hours per user this month — from attendance clock_in/clock_out
    let hoursMap = {};
    try {
      const [rows] = await pool.query(
        `SELECT user_id,
                ROUND(SUM(TIMESTAMPDIFF(MINUTE, clock_in_time,
                  COALESCE(clock_out_time, NOW())) / 60), 1) as hours
         FROM ${tbl('attendances')}
         WHERE MONTH(clock_in_time) = ? AND YEAR(clock_in_time) = ?
           AND clock_in_time IS NOT NULL
         GROUP BY user_id`,
        [month, year]
      );
      rows.forEach(r => { hoursMap[r.user_id] = parseFloat(r.hours) || 0; });
    } catch {}

    // Avg clock-in time + avg shift start per user this month
    let avgClockInMap = {};
    try {
      const [rows] = await pool.query(
        `SELECT user_id,
                TIME_FORMAT(SEC_TO_TIME(AVG(TIME_TO_SEC(TIME(clock_in_time)))), '%H:%i') as avg_clock_in,
                TIME_FORMAT(SEC_TO_TIME(AVG(TIME_TO_SEC(TIME(shift_start_time)))), '%H:%i') as avg_shift_start
         FROM ${tbl('attendances')}
         WHERE MONTH(clock_in_time) = ? AND YEAR(clock_in_time) = ?
           AND clock_in_time IS NOT NULL
         GROUP BY user_id`,
        [month, year]
      );
      rows.forEach(r => { avgClockInMap[r.user_id] = { avg_clock_in: r.avg_clock_in, avg_shift_start: r.avg_shift_start }; });
    } catch { }

    // Active project count per user
    let projectMap = {};
    try {
      const [rows] = await pool.query(
        `SELECT pm.user_id, COUNT(DISTINCT pm.project_id) as active_projects
         FROM ${tbl('project_members')} pm
         JOIN ${tbl('projects')} p ON p.id = pm.project_id AND p.status NOT IN ('completed', 'canceled')
         GROUP BY pm.user_id`
      );
      rows.forEach(r => { projectMap[r.user_id] = r.active_projects; });
    } catch {}

    // Working days in month — use office_open_days from DB (same as employees.js)
    let officeDays = [1, 2, 3, 4, 5, 6]; // Mon-Sat fallback
    try {
      const [[as]] = await pool.query(
        `SELECT office_open_days FROM ${tbl('attendance_settings')} LIMIT 1`
      );
      if (as?.office_open_days) {
        const parsed = JSON.parse(as.office_open_days);
        officeDays = parsed.map(d => Number(d) === 7 ? 0 : Number(d));
      }
    } catch {}
    const holidays = await getHolidays(year, month);
    const workingDays = getWorkingDays(year, month, holidays, officeDays);

    const result = employees.map(e => ({
      ...e,
      month_hours: hoursMap[e.id] || 0,
      active_projects: projectMap[e.id] || 0,
      avg_clock_in: avgClockInMap[e.id]?.avg_clock_in || null,
      avg_shift_start: avgClockInMap[e.id]?.avg_shift_start || null,
      attendance_pct: workingDays
        ? Math.round((e.present_days / workingDays) * 100)
        : 0,
    }));

    res.json({ success: true, employees: result, month, year, workingDays });
  } catch (err) {
    console.error('Team error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/team/export?month=&year=&department_id=&search=
router.get('/export', requireAuth, async (req, res) => {
  try {
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const departmentId = req.query.department_id || null;
    const search = req.query.search || null;

    const params = [month, year];
    let deptFilter = '', searchFilter = '';
    if (departmentId) { deptFilter = 'AND ed.department_id = ?'; params.push(departmentId); }
    if (search) { searchFilter = 'AND u.name LIKE ?'; params.push(`%${search}%`); }

    const [employees] = await pool.query(
      `SELECT u.id, u.name, d.team_name as department, ds.name as designation,
              COUNT(DISTINCT CASE WHEN MONTH(a.clock_in_time) = ? AND YEAR(a.clock_in_time) = ?
                THEN DATE(a.clock_in_time) END) as present_days
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('attendances')} a ON a.user_id = u.id
       LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
       WHERE u.status = 'active'
       ${deptFilter} ${searchFilter}
       GROUP BY u.id, u.name, d.team_name, ds.name
       ORDER BY u.name`,
      params
    );

    // Hours from attendance (same source as the main Team page)
    let hoursMap = {};
    try {
      const [rows] = await pool.query(
        `SELECT user_id,
                ROUND(SUM(TIMESTAMPDIFF(MINUTE, clock_in_time,
                  COALESCE(clock_out_time, NOW())) / 60), 1) as hours
         FROM ${tbl('attendances')}
         WHERE MONTH(clock_in_time) = ? AND YEAR(clock_in_time) = ?
           AND clock_in_time IS NOT NULL
         GROUP BY user_id`,
        [month, year]
      );
      rows.forEach(r => { hoursMap[r.user_id] = parseFloat(r.hours) || 0; });
    } catch {}

    let officeDays = [1, 2, 3, 4, 5, 6];
    try {
      const [[as]] = await pool.query(
        `SELECT office_open_days FROM ${tbl('attendance_settings')} LIMIT 1`
      );
      if (as?.office_open_days) {
        const parsed = JSON.parse(as.office_open_days);
        officeDays = parsed.map(d => Number(d) === 7 ? 0 : Number(d));
      }
    } catch {}

    const holidays = await getHolidays(year, month);
    const workingDays = getWorkingDays(year, month, holidays, officeDays);
    const headers = ['Name', 'Department', 'Designation', 'Present Days', 'Working Days', 'Attendance %', 'Month Hours'];
    const csvRows = employees.map(e => [
      `"${e.name}"`,
      `"${e.department || ''}"`,
      `"${e.designation || ''}"`,
      e.present_days,
      workingDays,
      workingDays ? Math.round((e.present_days / workingDays) * 100) : 0,
      hoursMap[e.id] || 0,
    ]);

    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="team_${month}_${year}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

async function getHolidays(year, month) {
  try {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(date, '%Y-%m-%d') as d FROM ${tbl('holidays')}
       WHERE YEAR(date) = ? AND MONTH(date) = ?`,
      [year, month]
    );
    return new Set(rows.map(r => r.d));
  } catch { return new Set(); }
}

function getWorkingDays(year, month, holidays = new Set(), officeDays = [1, 2, 3, 4, 5, 6]) {
  const now = new Date();
  const isCurrentMonth = (year === now.getFullYear() && month === now.getMonth() + 1);
  const start = new Date(year, month - 1, 1);
  const end = isCurrentMonth
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(year, month, 0);
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay();
    const ds = d.toISOString().slice(0, 10);
    if (officeDays.includes(day) && !holidays.has(ds)) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

module.exports = router;

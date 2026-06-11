const express  = require('express');
const router   = express.Router();
const ExcelJS  = require('exceljs');
const { pool, tbl }           = require('../db/connection');
const { getOfficeSettings }   = require('../db/officeSettings');
const { requireAuth }         = require('../middleware/auth');

const IST_MS = 5.5 * 60 * 60 * 1000;

function toISTMins(utcDate) {
  const d = new Date(new Date(utcDate).getTime() + IST_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function fmtDelay(mins) {
  if (!mins || mins <= 0) return '—';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtDateIST(utcDate) {
  if (!utcDate) return '—';
  const d = new Date(new Date(utcDate).getTime() + IST_MS);
  return `${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toISOString().slice(0, 10);
}

async function workingDaysInMonth(year, month) {
  let holidays = new Set();
  try {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(date,'%Y-%m-%d') as d FROM ${tbl('holidays')} WHERE YEAR(date)=? AND MONTH(date)=?`,
      [year, month]);
    holidays = new Set(rows.map(r => r.d));
  } catch {}
  const d = new Date(year, month - 1, 1); let n = 0;
  while (d.getMonth() === month - 1) {
    if (d.getDay() !== 0 && !holidays.has(d.toISOString().slice(0, 10))) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

async function detectTimesheetTable() {
  for (const t of ['project_time_logs', 'timelogs']) {
    try { await pool.query(`SELECT 1 FROM ${tbl(t)} LIMIT 1`); return t; } catch {}
  }
  return 'project_time_logs';
}

// ─── data-fetching functions (shared by routes + export) ──────────────────

async function fetchAttendance(q) {
  const today  = new Date().toISOString().slice(0, 10);
  const from   = q.from   || today;
  const to     = q.to     || today;
  const deptId = q.department_id || null;
  const userId = q.user_id       || null;
  const status = q.status        || null;

  const settings = await getOfficeSettings();
  const fallback = (() => { const [h,m] = settings.officeStart.split(':').map(Number); return h*60+m; })();

  let sql = `
    SELECT u.id, u.name, d.team_name as department, ds.name as designation,
           DATE_FORMAT(a.clock_in_time, '%Y-%m-%d') as date,
           a.clock_in_time, a.clock_out_time, a.late,
           ROUND(TIMESTAMPDIFF(MINUTE, a.clock_in_time,
             CASE WHEN a.clock_out_time IS NOT NULL THEN a.clock_out_time
                  WHEN DATE(a.clock_in_time) = UTC_DATE() THEN NOW()
                  ELSE NULL END) / 60, 2) as hours_worked,
           ess.shift_start_time
    FROM ${tbl('attendances')} a
    JOIN ${tbl('users')} u ON u.id = a.user_id
    LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
    LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
    LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
    LEFT JOIN ${tbl('employee_shift_schedules')} ess ON ess.user_id = a.user_id AND ess.date = DATE(a.clock_in_time)
    WHERE DATE(a.clock_in_time) BETWEEN ? AND ?`;
  const params = [from, to];
  if (deptId) { sql += ' AND ed.department_id = ?'; params.push(deptId); }
  if (userId) { sql += ' AND u.id = ?'; params.push(userId); }
  if (status === 'Late')    { sql += " AND a.late = 'yes'"; }
  if (status === 'On Time') { sql += " AND a.late = 'no'"; }
  sql += ' ORDER BY DATE(a.clock_in_time) ASC, u.name ASC LIMIT 5000';

  const [rows] = await pool.query(sql, params);
  rows.forEach(r => {
    if (r.clock_in_time && r.shift_start_time) {
      const ss = new Date(r.shift_start_time);
      r.delay_minutes = Math.max(0, toISTMins(r.clock_in_time) - (ss.getUTCHours()*60 + ss.getUTCMinutes()));
    } else if (r.clock_in_time) {
      r.delay_minutes = Math.max(0, toISTMins(r.clock_in_time) - fallback);
    } else { r.delay_minutes = 0; }
    r.status        = r.clock_in_time ? (r.late === 'yes' ? 'Late' : 'On Time') : 'Absent';
    r.clock_in_fmt  = r.clock_in_time  ? fmtDateIST(r.clock_in_time)  : '—';
    r.clock_out_fmt = r.clock_out_time ? fmtDateIST(r.clock_out_time) : '—';
    r.delay_fmt     = fmtDelay(r.delay_minutes);
  });
  return { rows, count: rows.length };
}

async function fetchLateArrivals(q) {
  const today  = new Date().toISOString().slice(0, 10);
  const from   = q.from   || today;
  const to     = q.to     || today;
  const deptId = q.department_id || null;

  const settings = await getOfficeSettings();
  const fallback = (() => { const [h,m] = settings.officeStart.split(':').map(Number); return h*60+m; })();

  let sql = `
    SELECT u.name, d.team_name as department,
           DATE_FORMAT(a.clock_in_time, '%Y-%m-%d') as date,
           a.clock_in_time, ess.shift_start_time
    FROM ${tbl('attendances')} a
    JOIN ${tbl('users')} u ON u.id = a.user_id
    LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
    LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
    LEFT JOIN ${tbl('employee_shift_schedules')} ess ON ess.user_id = a.user_id AND ess.date = DATE(a.clock_in_time)
    WHERE DATE(a.clock_in_time) BETWEEN ? AND ? AND a.late = 'yes'`;
  const params = [from, to];
  if (deptId) { sql += ' AND ed.department_id = ?'; params.push(deptId); }
  sql += ' ORDER BY DATE(a.clock_in_time) DESC, u.name ASC LIMIT 5000';

  const [rows] = await pool.query(sql, params);
  rows.forEach(r => {
    if (r.clock_in_time && r.shift_start_time) {
      const ss = new Date(r.shift_start_time);
      r.delay_minutes   = Math.max(0, toISTMins(r.clock_in_time) - (ss.getUTCHours()*60 + ss.getUTCMinutes()));
      r.shift_start_fmt = `${String(ss.getUTCHours()).padStart(2,'0')}:${String(ss.getUTCMinutes()).padStart(2,'0')}`;
    } else {
      r.delay_minutes   = r.clock_in_time ? Math.max(0, toISTMins(r.clock_in_time) - fallback) : 0;
      r.shift_start_fmt = settings.officeStart;
    }
    r.clock_in_fmt = r.clock_in_time ? fmtDateIST(r.clock_in_time) : '—';
    r.delay_fmt    = fmtDelay(r.delay_minutes);
  });
  return { rows, count: rows.length };
}

async function fetchMonthlySummary(q) {
  const now    = new Date();
  const month  = parseInt(q.month) || now.getMonth() + 1;
  const year   = parseInt(q.year)  || now.getFullYear();
  const deptId = q.department_id   || null;
  const wDays  = await workingDaysInMonth(year, month);

  let sql = `
    SELECT u.id, u.name, d.team_name as department, ds.name as designation,
           COUNT(DISTINCT DATE(a.clock_in_time)) as days_present,
           COUNT(DISTINCT CASE WHEN a.late = 'yes' THEN DATE(a.clock_in_time) END) as days_late,
           ROUND(SUM(CASE WHEN a.clock_out_time IS NOT NULL
             THEN TIMESTAMPDIFF(MINUTE, a.clock_in_time, a.clock_out_time) ELSE 0 END) / 60, 1) as total_hours,
           ROUND(AVG(CASE WHEN a.clock_out_time IS NOT NULL
             THEN TIMESTAMPDIFF(MINUTE, a.clock_in_time, a.clock_out_time) ELSE NULL END) / 60, 1) as avg_hours
    FROM ${tbl('users')} u
    LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
    LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
    LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
    LEFT JOIN ${tbl('attendances')} a ON a.user_id = u.id
      AND MONTH(a.clock_in_time) = ? AND YEAR(a.clock_in_time) = ?
    WHERE u.status = 'active'`;
  const params = [month, year];
  if (deptId) { sql += ' AND ed.department_id = ?'; params.push(deptId); }
  sql += ' GROUP BY u.id, u.name, d.team_name, ds.name ORDER BY u.name ASC';

  const [rows] = await pool.query(sql, params);
  rows.forEach(r => {
    r.days_present   = Number(r.days_present)   || 0;
    r.days_late      = Number(r.days_late)       || 0;
    r.days_absent    = Math.max(0, wDays - r.days_present);
    r.total_hours    = parseFloat(r.total_hours) || 0;
    r.avg_hours      = parseFloat(r.avg_hours)   || 0;
    r.attendance_pct = wDays > 0 ? Math.round((r.days_present / wDays) * 100) : 0;
  });
  return { rows, count: rows.length, workingDays: wDays, month, year };
}

async function fetchTimesheet(q) {
  const now = new Date();
  const from      = q.from       || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
  const to        = q.to         || now.toISOString().slice(0, 10);
  const userId    = q.user_id    || null;
  const projectId = q.project_id || null;

  const tblName = await detectTimesheetTable();
  let sql = `
    SELECT u.name as employee, p.project_name as project,
           DATE_FORMAT(tl.start_time, '%Y-%m-%d') as date,
           ROUND(tl.total_hours, 2) as hours,
           tl.memo as notes
    FROM ${tbl(tblName)} tl
    JOIN ${tbl('users')} u ON u.id = tl.user_id
    LEFT JOIN ${tbl('projects')} p ON p.id = tl.project_id
    WHERE DATE(tl.start_time) BETWEEN ? AND ?`;
  const params = [from, to];
  if (userId)    { sql += ' AND tl.user_id = ?';    params.push(userId); }
  if (projectId) { sql += ' AND tl.project_id = ?'; params.push(projectId); }
  sql += ' ORDER BY date DESC, u.name ASC LIMIT 5000';

  const [rows] = await pool.query(sql, params);
  const total_hours = rows.reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);
  return { rows, count: rows.length, total_hours: parseFloat(total_hours.toFixed(2)) };
}

async function fetchProjects(q) {
  const status = q.status || null;
  let sql = `
    SELECT p.project_name as name, p.project_short_code as short_code,
           p.status, DATE_FORMAT(p.start_date,'%Y-%m-%d') as start_date,
           DATE_FORMAT(p.deadline,'%Y-%m-%d') as deadline,
           pm_user.name as pm_name,
           p.project_budget as budget, p.hours_allocated,
           p.completion_percent as completion_pct,
           DATEDIFF(p.deadline, CURDATE()) as days_remaining,
           COALESCE((SELECT COUNT(*) FROM ${tbl('tasks')} pt WHERE pt.project_id = p.id),0) as total_tasks,
           COALESCE((SELECT COUNT(*) FROM ${tbl('tasks')} pt WHERE pt.project_id = p.id AND pt.status='completed'),0) as completed_tasks
    FROM ${tbl('projects')} p
    LEFT JOIN ${tbl('users')} pm_user ON pm_user.id = p.project_admin
    WHERE p.deleted_at IS NULL`;
  const params = [];
  if (status) { sql += ' AND p.status = ?'; params.push(status); }
  sql += ' ORDER BY p.deadline ASC';

  const [rows] = await pool.query(sql, params);
  rows.forEach(r => {
    r.days_remaining = Number(r.days_remaining);
    r.budget         = parseFloat(r.budget) || 0;
    r.completion_pct = parseFloat(r.completion_pct) || 0;
    r.health = r.days_remaining < 0 ? 'Overdue'
             : r.days_remaining <= 7 ? 'At Risk'
             : 'On Track';
  });
  return { rows, count: rows.length };
}

async function fetchTeam(q) {
  const now    = new Date();
  const month  = now.getMonth() + 1;
  const year   = now.getFullYear();
  const deptId = q.department_id || null;
  const wDays  = await workingDaysInMonth(year, month);
  const tblName = await detectTimesheetTable();

  let sql = `
    SELECT u.id, u.name, d.team_name as department, ds.name as designation,
           u.created_at as join_date,
           COUNT(DISTINCT DATE(a.clock_in_time)) as this_month_present,
           COUNT(DISTINCT CASE WHEN a.late = 'yes' THEN DATE(a.clock_in_time) END) as this_month_late,
           ROUND(COALESCE(SUM(tl.total_hours), 0), 1) as this_month_hours
    FROM ${tbl('users')} u
    LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
    LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
    LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
    LEFT JOIN ${tbl('attendances')} a ON a.user_id = u.id
      AND MONTH(a.clock_in_time) = ? AND YEAR(a.clock_in_time) = ?
    LEFT JOIN ${tbl(tblName)} tl ON tl.user_id = u.id
      AND MONTH(tl.start_time) = ? AND YEAR(tl.start_time) = ?
    WHERE u.status = 'active'`;
  const params = [month, year, month, year];
  if (deptId) { sql += ' AND ed.department_id = ?'; params.push(deptId); }
  sql += ' GROUP BY u.id, u.name, d.team_name, ds.name, u.created_at ORDER BY u.name ASC';

  const [rows] = await pool.query(sql, params);
  rows.forEach(r => {
    r.this_month_present = Number(r.this_month_present) || 0;
    r.this_month_late    = Number(r.this_month_late)    || 0;
    r.this_month_hours   = parseFloat(r.this_month_hours) || 0;
    r.attendance_pct     = wDays > 0 ? Math.round((r.this_month_present / wDays) * 100) : 0;
    r.join_date          = fmtDate(r.join_date);
  });
  return { rows, count: rows.length, workingDays: wDays };
}

const FETCHERS = {
  attendance:          fetchAttendance,
  'late-arrivals':     fetchLateArrivals,
  'monthly-summary':   fetchMonthlySummary,
  timesheet:           fetchTimesheet,
  projects:            fetchProjects,
  team:                fetchTeam,
};

// ─── Routes ───────────────────────────────────────────────────────────────

router.get('/filters', requireAuth, async (req, res) => {
  try {
    const [depts]     = await pool.query(`SELECT id, team_name as name FROM ${tbl('teams')} ORDER BY team_name`);
    const [employees] = await pool.query(`SELECT id, name FROM ${tbl('users')} WHERE status='active' ORDER BY name`);
    let projects = [];
    try {
      const [rows] = await pool.query(`SELECT id, project_name as name FROM ${tbl('projects')} WHERE deleted_at IS NULL ORDER BY project_name`);
      projects = rows;
    } catch {}
    res.json({ success: true, departments: depts, employees, projects });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/attendance', requireAuth, async (req, res) => {
  try { res.json({ success: true, ...(await fetchAttendance(req.query)) }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/late-arrivals', requireAuth, async (req, res) => {
  try { res.json({ success: true, ...(await fetchLateArrivals(req.query)) }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/monthly-summary', requireAuth, async (req, res) => {
  try { res.json({ success: true, ...(await fetchMonthlySummary(req.query)) }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/timesheet', requireAuth, async (req, res) => {
  try { res.json({ success: true, ...(await fetchTimesheet(req.query)) }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/projects', requireAuth, async (req, res) => {
  try { res.json({ success: true, ...(await fetchProjects(req.query)) }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/team', requireAuth, async (req, res) => {
  try { res.json({ success: true, ...(await fetchTeam(req.query)) }); }
  catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ─── Excel export column definitions ─────────────────────────────────────

const REPORT_COLS = {
  attendance: [
    { key: 'name',          label: 'Employee',      width: 22 },
    { key: 'department',    label: 'Department',    width: 20 },
    { key: 'designation',   label: 'Designation',   width: 20 },
    { key: 'date',          label: 'Date',          width: 13 },
    { key: 'clock_in_fmt',  label: 'Clock In',      width: 12 },
    { key: 'clock_out_fmt', label: 'Clock Out',     width: 12 },
    { key: 'hours_worked',  label: 'Hours Worked',  width: 14 },
    { key: 'delay_fmt',     label: 'Delay',         width: 10 },
    { key: 'status',        label: 'Status',        width: 12 },
  ],
  'late-arrivals': [
    { key: 'date',            label: 'Date',        width: 13 },
    { key: 'name',            label: 'Employee',    width: 22 },
    { key: 'department',      label: 'Department',  width: 20 },
    { key: 'shift_start_fmt', label: 'Shift Start', width: 13 },
    { key: 'clock_in_fmt',    label: 'Clock In',    width: 12 },
    { key: 'delay_minutes',   label: 'Delay (min)', width: 13 },
    { key: 'delay_fmt',       label: 'Delay',       width: 12 },
  ],
  'monthly-summary': [
    { key: 'name',           label: 'Employee',      width: 22 },
    { key: 'department',     label: 'Department',    width: 20 },
    { key: 'designation',    label: 'Designation',   width: 20 },
    { key: 'days_present',   label: 'Days Present',  width: 14 },
    { key: 'days_absent',    label: 'Days Absent',   width: 13 },
    { key: 'days_late',      label: 'Days Late',     width: 12 },
    { key: 'attendance_pct', label: 'Attendance %',  width: 14 },
    { key: 'total_hours',    label: 'Total Hours',   width: 13 },
    { key: 'avg_hours',      label: 'Avg Hours/Day', width: 14 },
  ],
  timesheet: [
    { key: 'date',     label: 'Date',     width: 13 },
    { key: 'employee', label: 'Employee', width: 22 },
    { key: 'project',  label: 'Project',  width: 28 },
    { key: 'hours',    label: 'Hours',    width: 10 },
    { key: 'notes',    label: 'Notes',    width: 35 },
  ],
  projects: [
    { key: 'name',           label: 'Project',         width: 28 },
    { key: 'short_code',     label: 'Code',            width: 10 },
    { key: 'status',         label: 'Status',          width: 14 },
    { key: 'pm_name',        label: 'Project Manager', width: 22 },
    { key: 'start_date',     label: 'Start Date',      width: 13 },
    { key: 'deadline',       label: 'Deadline',        width: 13 },
    { key: 'days_remaining', label: 'Days Left',       width: 12 },
    { key: 'completion_pct', label: 'Completion %',    width: 14 },
    { key: 'budget',         label: 'Budget',          width: 14 },
    { key: 'health',         label: 'Health',          width: 12 },
  ],
  team: [
    { key: 'name',               label: 'Employee',      width: 22 },
    { key: 'department',         label: 'Department',    width: 20 },
    { key: 'designation',        label: 'Designation',   width: 20 },
    { key: 'join_date',          label: 'Join Date',     width: 13 },
    { key: 'this_month_present', label: 'Days Present',  width: 14 },
    { key: 'this_month_late',    label: 'Days Late',     width: 12 },
    { key: 'attendance_pct',     label: 'Attendance %',  width: 14 },
    { key: 'this_month_hours',   label: 'Hours (Month)', width: 14 },
  ],
};

const REPORT_LABELS = {
  attendance:         'Daily Attendance Report',
  'late-arrivals':    'Late Arrivals Report',
  'monthly-summary':  'Monthly Attendance Summary',
  timesheet:          'Timesheet Report',
  projects:           'Project Status Report',
  team:               'Team Overview Report',
};

// ─── GET /api/reports/export ──────────────────────────────────────────────

router.get('/export', requireAuth, async (req, res) => {
  try {
    const type    = req.query.type || 'attendance';
    const colKeys = req.query.cols ? req.query.cols.split(',') : null;

    const fetcher = FETCHERS[type];
    if (!fetcher) return res.status(400).json({ success: false, message: `Unknown report type: ${type}` });

    const data = await fetcher(req.query);
    const rows = data.rows || [];
    let cols   = REPORT_COLS[type] || REPORT_COLS.attendance;
    if (colKeys && colKeys.length) cols = cols.filter(c => colKeys.includes(c.key));

    const label  = REPORT_LABELS[type] || 'Report';
    const period = req.query.from && req.query.to
      ? `${req.query.from} to ${req.query.to}`
      : req.query.month
        ? `${String(req.query.month).padStart(2,'0')}/${req.query.year || new Date().getFullYear()}`
        : `As of ${new Date().toLocaleDateString('en-IN')}`;

    const wb = new ExcelJS.Workbook();
    wb.creator = 'WorkDash';
    wb.created  = new Date();

    const ws = wb.addWorksheet(label, {
      views: [{ state: 'frozen', ySplit: 5 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    const GREEN = 'FF1D9E75';
    const WHITE = 'FFFFFFFF';
    const GRAY  = 'FF6B7280';

    ws.addRow([label]);
    ws.getRow(1).font   = { bold: true, size: 14, color: { argb: 'FF111827' } };
    ws.getRow(1).height = 24;

    ws.addRow([period]);
    ws.getRow(2).font = { size: 11, color: { argb: GRAY } };

    ws.addRow([`${rows.length} record${rows.length !== 1 ? 's' : ''}`]);
    ws.getRow(3).font = { size: 10, italic: true, color: { argb: 'FF9CA3AF' } };

    ws.addRow([]);

    const headerRow = ws.addRow(cols.map(c => c.label));
    headerRow.eachCell(cell => {
      cell.font      = { bold: true, color: { argb: WHITE }, size: 11 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border    = { bottom: { style: 'thin', color: { argb: 'FF0F6E56' } } };
    });
    headerRow.height = 22;

    rows.forEach((row, i) => {
      const dr = ws.addRow(cols.map(c => {
        const v = row[c.key];
        if (v === null || v === undefined || v === '') return '—';
        return v;
      }));
      if (i % 2 === 1) {
        dr.eachCell(cell => {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        });
      }
      dr.eachCell(cell => {
        cell.alignment = { vertical: 'middle' };
        cell.border    = { bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } } };
      });
    });

    cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width || 16; });

    if (cols.length > 1) {
      ws.mergeCells(1, 1, 1, cols.length);
      ws.mergeCells(2, 1, 2, cols.length);
      ws.mergeCells(3, 1, 3, cols.length);
    }

    const fileSlug = label.replace(/ /g, '_');
    const dateSlug = period.slice(0, 10).replace(/\//g, '-');
    const filename  = `${fileSlug}_${dateSlug}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[reports/export]', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

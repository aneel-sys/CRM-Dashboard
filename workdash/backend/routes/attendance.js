const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { getOfficeSettings } = require('../db/officeSettings');
const { requireAuth } = require('../middleware/auth');



function buildAttendanceQuery(date, departmentId) {
  const deptFilter = departmentId ? 'AND ed.department_id = ?' : '';
  const sql = `
    SELECT
      u.id,
      u.name,
      u.email,
      d.team_name  AS department,
      ds.name      AS designation,
      a.clock_in_time,
      a.clock_out_time,
      NULL AS delay_minutes,
      CASE
        WHEN a.clock_in_time IS NULL THEN 'Absent'
        WHEN a.late = 'yes' THEN 'Late'
        ELSE 'On Time'
      END AS attendance_status,
      ROUND(
        TIMESTAMPDIFF(MINUTE, a.clock_in_time, COALESCE(a.clock_out_time, NOW())) / 60,
        2
      ) AS hours_worked,
      ess.shift_start_time,
      es.late_mark_duration AS shift_late_mark
    FROM ${tbl('users')} u
    LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
    LEFT JOIN ${tbl('attendances')} a
      ON a.user_id = u.id AND DATE(a.clock_in_time) = ?
    LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
    LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
    LEFT JOIN ${tbl('employee_shift_schedules')} ess ON ess.user_id = u.id AND ess.date = ?
    LEFT JOIN ${tbl('employee_shifts')} es ON es.id = ess.employee_shift_id
    WHERE u.status = 'active'
    ${deptFilter}
    ORDER BY u.name ASC
  `;

  const finalParams = [date, date];
  if (departmentId) finalParams.push(departmentId);
  return { sql, finalParams };
}

// For past dates a missing clock-out would make hours run until NOW() —
// null the hours and flag the row instead of showing 20h+ shifts.
function flagMissingClockOuts(rows, date) {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (date >= todayStr) return;
  rows.forEach(r => {
    if (r.clock_in_time && !r.clock_out_time) {
      r.hours_worked = null;
      r.missing_clock_out = true;
    }
  });
}

async function enrichWithLeaveData(rows, date) {
  try {
    const [leaveRows] = await pool.query(
      `SELECT l.user_id,
              MIN(l.status)       AS leave_status,
              MIN(lt.type_name)   AS leave_type,
              MIN(l.reason)       AS leave_reason
       FROM ${tbl('leaves')} l
       LEFT JOIN ${tbl('leave_types')} lt ON lt.id = l.leave_type_id
       WHERE DATE(l.leave_date) = ?
       GROUP BY l.user_id`,
      [date]
    );
    const leaveMap = {};
    leaveRows.forEach(r => { leaveMap[r.user_id] = r; });
    rows.forEach(r => {
      const lv = leaveMap[r.id];
      r.leave_type   = lv?.leave_type   || null;
      r.leave_status = lv?.leave_status || null;
      r.leave_reason = lv?.leave_reason || null;
    });
  } catch { /* leaves enrichment failed — fields remain null */ }
}

// GET /api/attendance?date=YYYY-MM-DD&department_id=&status=
router.get('/', requireAuth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const departmentId = req.query.department_id || null;
    const statusFilter = req.query.status || null;
    const settings = await getOfficeSettings();

    const { sql, finalParams } = buildAttendanceQuery(date, departmentId);
    let [rows] = await pool.query(sql, finalParams);

    const IST_MS = 5.5 * 60 * 60 * 1000;
    const fallbackThresh = (() => {
      const [oh, om] = settings.officeStart.split(':').map(Number);
      return oh * 60 + om;
    })();
    rows.forEach(r => {
      if (r.clock_in_time && r.shift_start_time) {
        const clockInIST = new Date(new Date(r.clock_in_time).getTime() + IST_MS);
        const clockMins = clockInIST.getUTCHours() * 60 + clockInIST.getUTCMinutes();
        const ss = new Date(r.shift_start_time);
        const shiftMins = ss.getUTCHours() * 60 + ss.getUTCMinutes();
        r.delay_minutes = Math.max(0, clockMins - shiftMins);
      } else if (r.clock_in_time) {
        const local = new Date(new Date(r.clock_in_time).getTime() + IST_MS);
        r.delay_minutes = Math.max(0, local.getUTCHours() * 60 + local.getUTCMinutes() - fallbackThresh);
      } else {
        r.delay_minutes = 0;
      }
    });

    flagMissingClockOuts(rows, date);
    await enrichWithLeaveData(rows, date);

    if (statusFilter && statusFilter !== 'all') {
      rows = rows.filter(r => r.attendance_status.toLowerCase() === statusFilter.toLowerCase());
    }

    const present = rows.filter(r => r.attendance_status !== 'Absent').length;
    const late = rows.filter(r => r.attendance_status === 'Late').length;
    const onTime = rows.filter(r => r.attendance_status === 'On Time').length;
    const absent = rows.filter(r => r.attendance_status === 'Absent').length;

    res.json({
      success: true,
      date,
      stats: { present, late, onTime, absent, total: rows.length },
      records: rows,
    });
  } catch (err) {
    console.error('Attendance error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/export?date=YYYY-MM-DD&department_id=&status=
router.get('/export', requireAuth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const departmentId = req.query.department_id || null;
    const statusFilter = req.query.status || null;
    const settings = await getOfficeSettings();

    const { sql, finalParams } = buildAttendanceQuery(date, departmentId);
    let [rows] = await pool.query(sql, finalParams);

    const IST_MS = 5.5 * 60 * 60 * 1000;
    const fallbackThr = (() => {
      const [oh2, om2] = settings.officeStart.split(':').map(Number);
      return oh2 * 60 + om2;
    })();
    rows.forEach(r => {
      if (r.clock_in_time && r.shift_start_time) {
        const clockInIST = new Date(new Date(r.clock_in_time).getTime() + IST_MS);
        const clockMins = clockInIST.getUTCHours() * 60 + clockInIST.getUTCMinutes();
        const ss = new Date(r.shift_start_time);
        const shiftMins = ss.getUTCHours() * 60 + ss.getUTCMinutes();
        r.delay_minutes = Math.max(0, clockMins - shiftMins);
      } else if (r.clock_in_time) {
        const local = new Date(new Date(r.clock_in_time).getTime() + IST_MS);
        r.delay_minutes = Math.max(0, local.getUTCHours() * 60 + local.getUTCMinutes() - fallbackThr);
      } else { r.delay_minutes = 0; }
    });

    flagMissingClockOuts(rows, date);
    await enrichWithLeaveData(rows, date);

    if (statusFilter && statusFilter !== 'all') {
      rows = rows.filter(r => r.attendance_status.toLowerCase() === statusFilter.toLowerCase());
    }

    const fmtTimeIST = dt => {
      if (!dt) return '';
      const d = new Date(new Date(dt).getTime() + IST_MS);
      const h = String(d.getUTCHours()).padStart(2, '0');
      const m = String(d.getUTCMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    };
    // DD-MM-YYYY avoids Excel auto-converting the date to a serial number
    const [dy, dm, dd] = date.split('-');
    const dateLabel = `${dd}-${dm}-${dy}`;

    const headers = ['Name', 'Department', 'Designation', 'Date', 'Clock In', 'Clock Out', 'Delay (min)', 'Hours Worked', 'Status', 'Leave Type', 'Leave Status', 'Leave Reason'];
    const csvRows = rows.map(r => [
      `"${r.name}"`,
      `"${r.department || ''}"`,
      `"${r.designation || ''}"`,
      `"${dateLabel}"`,
      `"${fmtTimeIST(r.clock_in_time)}"`,
      `"${r.missing_clock_out ? 'MISSING' : fmtTimeIST(r.clock_out_time)}"`,
      r.delay_minutes > 0 ? r.delay_minutes : 0,
      r.hours_worked ? parseFloat(r.hours_worked).toFixed(1) : '0.0',
      `"${r.attendance_status}"`,
      `"${r.leave_type || ''}"`,
      `"${r.leave_status || ''}"`,
      `"${(r.leave_reason || '').replace(/"/g, '""')}"`,
    ]);

    // UTF-8 BOM so Excel opens the file correctly without mojibake
    const BOM = '﻿';
    const csv = BOM + [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${date}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/trend?days=30
router.get('/trend', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const settings = await getOfficeSettings();
    // Worksuite stores open days as 1=Mon … 7=Sun; JS getUTCDay() is 0=Sun
    const openDays = (settings.officeOpenDays || [1, 2, 3, 4, 5])
      .map(d => Number(d) === 7 ? 0 : Number(d));

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM ${tbl('users')} WHERE status = 'active'`
    );

    let holidaySet = new Set();
    try {
      const [hrows] = await pool.query(
        `SELECT DATE_FORMAT(date, '%Y-%m-%d') as d FROM ${tbl('holidays')}
         WHERE date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND date <= CURDATE()`,
        [days - 1]
      );
      holidaySet = new Set(hrows.map(r => r.d));
    } catch { /* no holidays table — skip */ }

    const [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(DATE(clock_in_time), '%Y-%m-%d') as date,
         COUNT(DISTINCT user_id) as present,
         COUNT(DISTINCT CASE WHEN late = 'yes' THEN user_id END) as late
       FROM ${tbl('attendances')}
       WHERE DATE(clock_in_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND DATE(clock_in_time) <= CURDATE()
       GROUP BY DATE(clock_in_time)
       ORDER BY date ASC`,
      [days - 1]
    );

    // Office working days only — weekends/holidays would show everyone absent
    const trend = rows
      .filter(r => openDays.includes(new Date(`${r.date}T00:00:00Z`).getUTCDay()) && !holidaySet.has(r.date))
      .map(r => ({
        date: r.date,
        label: new Date(`${r.date}T00:00:00Z`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }),
        present: Number(r.present),
        late: Number(r.late),
        onTime: Math.max(0, Number(r.present) - Number(r.late)),
        absent: Math.max(0, total - Number(r.present)),
      }));

    res.json({ success: true, trend, total });
  } catch (err) {
    console.error('Attendance trend error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/late-offenders?days=30 — most frequently late employees
router.get('/late-offenders', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const [rows] = await pool.query(
      `SELECT u.id, u.name, d.team_name as department,
              COUNT(DISTINCT CASE WHEN a.late = 'yes' THEN DATE(a.clock_in_time) END) as late_days,
              COUNT(DISTINCT DATE(a.clock_in_time)) as present_days,
              DATE_FORMAT(MAX(CASE WHEN a.late = 'yes' THEN DATE(a.clock_in_time) END), '%d %b') as last_late
       FROM ${tbl('attendances')} a
       JOIN ${tbl('users')} u ON u.id = a.user_id AND u.status = 'active'
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
       WHERE DATE(a.clock_in_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY u.id, u.name, d.team_name
       HAVING late_days > 0
       ORDER BY late_days DESC, present_days ASC
       LIMIT 10`,
      [days - 1]
    );
    const offenders = rows.map(r => ({
      id: r.id,
      name: r.name,
      department: r.department,
      lateDays: Number(r.late_days),
      presentDays: Number(r.present_days),
      latePct: r.present_days > 0 ? Math.round((r.late_days / r.present_days) * 100) : 0,
      lastLate: r.last_late,
    }));
    res.json({ success: true, days, offenders });
  } catch (err) {
    console.error('Late offenders error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/attendance/departments
router.get('/departments', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, team_name as name FROM ${tbl('teams')} ORDER BY team_name`
    );
    res.json({ success: true, departments: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

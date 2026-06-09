const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

// GET /api/employees
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email,
              d.team_name as department,
              ds.name as designation,
              u.status, u.created_at
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
       WHERE u.status = 'active'
       ORDER BY u.name`
    );
    res.json({ success: true, employees: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/employees/:id/report?month=5&year=2025
router.get('/:id/report', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Fetch which days the office is open (Worksuite: 1=Mon…7=Sun → JS getDay: 0=Sun,1=Mon…6=Sat)
    let officeDays = [1, 2, 3, 4, 5]; // Mon-Fri fallback
    try {
      const [[as]] = await pool.query(
        `SELECT office_open_days FROM ${tbl('attendance_settings')} LIMIT 1`
      );
      if (as?.office_open_days) {
        const parsed = JSON.parse(as.office_open_days);
        officeDays = parsed.map(d => Number(d) === 7 ? 0 : Number(d));
      }
    } catch {}

    // Employee info
    const [[employee]] = await pool.query(
      `SELECT u.id, u.name, u.email,
              d.team_name as department,
              ds.name as designation,
              u.created_at
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
       WHERE u.id = ?`,
      [id]
    );

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Today's attendance status
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayStatus = 'Absent';
    try {
      const [[todayRow]] = await pool.query(
        `SELECT late FROM ${tbl('attendances')}
         WHERE user_id = ? AND DATE(clock_in_time) = ? LIMIT 1`,
        [id, todayStr]
      );
      if (todayRow) todayStatus = todayRow.late === 'yes' ? 'Late' : 'Present';
    } catch {}

    // Attendance records for the month — times converted to IST (+5:30 = +19800s)
    const [attendanceRows] = await pool.query(
      `SELECT DATE(DATE_ADD(clock_in_time, INTERVAL 19800 SECOND)) as date,
              clock_in_time,
              clock_out_time,
              TIME_FORMAT(DATE_ADD(clock_in_time,  INTERVAL 19800 SECOND), '%H:%i') as clock_in,
              TIME_FORMAT(DATE_ADD(clock_out_time, INTERVAL 19800 SECOND), '%H:%i') as clock_out,
              CASE WHEN late = 'yes' THEN 1 ELSE 0 END as is_late,
              ROUND(TIMESTAMPDIFF(MINUTE, clock_in_time, COALESCE(clock_out_time, NOW())) / 60, 2) as hours
       FROM ${tbl('attendances')}
       WHERE user_id = ?
         AND MONTH(clock_in_time) = ? AND YEAR(clock_in_time) = ?
       ORDER BY clock_in_time`,
      [id, month, year]
    );

    // Leave days this month
    const [leaveRows] = await pool.query(
      `SELECT leave_date as date FROM ${tbl('leaves')}
       WHERE user_id = ? AND status = 'approved'
         AND MONTH(leave_date) = ? AND YEAR(leave_date) = ?`,
      [id, month, year]
    ).catch(() => [[]]);

    const presentDays = attendanceRows.length;
    const lateDays = attendanceRows.filter(r => r.is_late).length;
    const leaveDays = leaveRows.length;

    // Working days in month (Mon-Fri)
    const workingDays = getWorkingDays(year, month, officeDays);
    const absentDays = Math.max(0, workingDays - presentDays - leaveDays);

    // Average clock-in / clock-out
    const validClockIns = attendanceRows.filter(r => r.clock_in);
    const avgClockIn = avgTime(validClockIns.map(r => r.clock_in));
    const validClockOuts = attendanceRows.filter(r => r.clock_out);
    const avgClockOut = avgTime(validClockOuts.map(r => r.clock_out));

    // Total hours
    const totalHours = attendanceRows.reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);

    // Attendance rate — capped at 100% (extra Saturday work can push presentDays > workingDays)
    const attendanceRate = workingDays ? Math.min(100, Math.round((presentDays / workingDays) * 100)) : 0;

    // Daily hours array
    const dailyHours = attendanceRows.map(r => ({
      date: r.date,
      hours: parseFloat(r.hours) || 0,
      is_late: !!r.is_late,
    }));

    // Hours by project
    let projectHours = [];
    try {
      const [ph] = await pool.query(
        `SELECT p.id, p.project_name as name,
                COALESCE(SUM(CAST(tl.total_hours AS DECIMAL(10,2))), 0) as hours
         FROM ${tbl('project_time_logs')} tl
         JOIN ${tbl('projects')} p ON p.id = tl.project_id
         WHERE tl.user_id = ?
           AND MONTH(tl.start_time) = ? AND YEAR(tl.start_time) = ?
         GROUP BY p.id, p.project_name
         ORDER BY hours DESC`,
        [id, month, year]
      );
      projectHours = ph;
    } catch {
      try {
        const [ph] = await pool.query(
          `SELECT p.id, p.project_name as name,
                  COALESCE(SUM(CAST(tl.total_hours AS DECIMAL(10,2))), 0) as hours
           FROM ${tbl('timelogs')} tl
           JOIN ${tbl('projects')} p ON p.id = tl.project_id
           WHERE tl.user_id = ?
             AND MONTH(tl.start_time) = ? AND YEAR(tl.start_time) = ?
           GROUP BY p.id, p.project_name
           ORDER BY hours DESC`,
          [id, month, year]
        );
        projectHours = ph;
      } catch { projectHours = []; }
    }

    // Leave requests for the year — grouped by unique_id so multi-day = one row
    let leaveRequests = [];
    try {
      const [lr] = await pool.query(
        `SELECT
           COALESCE(l.unique_id, CAST(l.id AS CHAR)) as request_id,
           MAX(lt.type_name) as type_name,
           MAX(lt.color)     as color,
           DATE_FORMAT(MIN(l.leave_date), '%Y-%m-%d') as from_date,
           DATE_FORMAT(MAX(l.leave_date), '%Y-%m-%d') as to_date,
           SUM(CASE WHEN l.duration = 'half day' THEN 0.5 ELSE 1 END) as total_days,
           MAX(l.reason)         as reason,
           MAX(l.status)         as status,
           MAX(l.reject_reason)  as reject_reason,
           MAX(l.approve_reason) as approve_reason,
           MAX(l.paid)           as paid,
           MAX(l.half_day_type)  as half_day_type,
           MAX(l.created_at)     as applied_at
         FROM ${tbl('leaves')} l
         LEFT JOIN ${tbl('leave_types')} lt ON lt.id = l.leave_type_id
         WHERE l.user_id = ?
           AND YEAR(l.leave_date) = ?
         GROUP BY COALESCE(l.unique_id, CAST(l.id AS CHAR))
         ORDER BY from_date DESC`,
        [id, year]
      );
      leaveRequests = lr;
    } catch {}

    res.json({
      success: true,
      employee,
      month,
      year,
      stats: {
        presentDays,
        lateDays,
        absentDays,
        leaveDays,
        totalHours: totalHours.toFixed(1),
        attendanceRate,
        avgClockIn,
        avgClockOut,
        workingDays,
        todayStatus,
      },
      dailyHours,
      projectHours,
      leaveRequests,
    });
  } catch (err) {
    console.error('Employee report error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

function getWorkingDays(year, month, officeDays = [1, 2, 3, 4, 5]) {
  const now = new Date();
  const isCurrentMonth = (year === now.getFullYear() && month === now.getMonth() + 1);
  const start = new Date(year, month - 1, 1);
  // For the current month count only elapsed days; for past months count the full month
  const end = isCurrentMonth
    ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
    : new Date(year, month, 0);
  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    if (officeDays.includes(d.getDay())) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

function avgTime(times) {
  if (!times.length) return null;
  const totalMinutes = times.reduce((sum, t) => {
    if (!t) return sum;
    const [h, m] = String(t).split(':').map(Number);
    return sum + h * 60 + m;
  }, 0);
  const avg = Math.round(totalMinutes / times.length);
  const h = String(Math.floor(avg / 60)).padStart(2, '0');
  const m = String(avg % 60).padStart(2, '0');
  return `${h}:${m}`;
}

module.exports = router;

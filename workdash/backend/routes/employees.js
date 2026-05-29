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
       LEFT JOIN ${tbl('departments')} d ON d.id = u.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = u.designation_id
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
    const officeStart = process.env.OFFICE_START_TIME || '09:00';

    // Employee info
    const [[employee]] = await pool.query(
      `SELECT u.id, u.name, u.email,
              d.team_name as department,
              ds.name as designation,
              u.created_at
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl('departments')} d ON d.id = u.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = u.designation_id
       WHERE u.id = ?`,
      [id]
    );

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Attendance records for the month
    const [attendanceRows] = await pool.query(
      `SELECT DATE(clock_in_time) as date,
              clock_in_time,
              clock_out_time,
              TIME(clock_in_time) as clock_in,
              TIME(clock_out_time) as clock_out,
              CASE WHEN TIME(clock_in_time) > ? THEN 1 ELSE 0 END as is_late,
              ROUND(TIMESTAMPDIFF(MINUTE, clock_in_time, COALESCE(clock_out_time, NOW())) / 60, 2) as hours
       FROM ${tbl('attendances')}
       WHERE user_id = ?
         AND MONTH(clock_in_time) = ? AND YEAR(clock_in_time) = ?
       ORDER BY clock_in_time`,
      [officeStart, id, month, year]
    );

    // Leave days this month
    const [leaveRows] = await pool.query(
      `SELECT date FROM ${tbl('leaves')}
       WHERE user_id = ? AND status = 'approved'
         AND MONTH(date) = ? AND YEAR(date) = ?`,
      [id, month, year]
    ).catch(() => [[]]);

    const presentDays = attendanceRows.length;
    const lateDays = attendanceRows.filter(r => r.is_late).length;
    const leaveDays = leaveRows.length;

    // Working days in month (Mon-Fri)
    const workingDays = getWorkingDays(year, month);
    const absentDays = Math.max(0, workingDays - presentDays - leaveDays);

    // Average clock-in / clock-out
    const validClockIns = attendanceRows.filter(r => r.clock_in);
    const avgClockIn = avgTime(validClockIns.map(r => r.clock_in));
    const validClockOuts = attendanceRows.filter(r => r.clock_out);
    const avgClockOut = avgTime(validClockOuts.map(r => r.clock_out));

    // Total hours
    const totalHours = attendanceRows.reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);

    // Attendance rate
    const attendanceRate = workingDays ? Math.round((presentDays / workingDays) * 100) : 0;

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
                COALESCE(SUM(tl.total_hours), 0) as hours
         FROM ${tbl('project_time_logs')} tl
         JOIN ${tbl('projects')} p ON p.id = tl.project_id
         WHERE tl.user_id = ?
           AND MONTH(tl.created_at) = ? AND YEAR(tl.created_at) = ?
         GROUP BY p.id, p.project_name
         ORDER BY hours DESC`,
        [id, month, year]
      );
      projectHours = ph;
    } catch {
      try {
        const [ph] = await pool.query(
          `SELECT p.id, p.project_name as name,
                  COALESCE(SUM(tl.total_hours), 0) as hours
           FROM ${tbl('timelogs')} tl
           JOIN ${tbl('projects')} p ON p.id = tl.project_id
           WHERE tl.user_id = ?
             AND MONTH(tl.created_at) = ? AND YEAR(tl.created_at) = ?
           GROUP BY p.id, p.project_name
           ORDER BY hours DESC`,
          [id, month, year]
        );
        projectHours = ph;
      } catch { projectHours = []; }
    }

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
      },
      dailyHours,
      projectHours,
    });
  } catch (err) {
    console.error('Employee report error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

function getWorkingDays(year, month) {
  const date = new Date(year, month - 1, 1);
  let count = 0;
  while (date.getMonth() === month - 1) {
    const day = date.getDay();
    if (day !== 0 && day !== 6) count++;
    date.setDate(date.getDate() + 1);
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

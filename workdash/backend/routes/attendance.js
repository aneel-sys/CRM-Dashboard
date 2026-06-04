const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { getOfficeStartTime } = require('../db/officeSettings');
const { requireAuth } = require('../middleware/auth');



function buildAttendanceQuery(date, departmentId, officeStartTime) {
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
      TIMESTAMPDIFF(MINUTE, CONCAT(?, ' ', ?), a.clock_in_time) AS delay_minutes,
      CASE
        WHEN a.clock_in_time IS NULL THEN 'Absent'
        WHEN TIME(a.clock_in_time) > ? THEN 'Late'
        ELSE 'On Time'
      END AS attendance_status,
      ROUND(
        TIMESTAMPDIFF(MINUTE, a.clock_in_time, COALESCE(a.clock_out_time, NOW())) / 60,
        2
      ) AS hours_worked
    FROM ${tbl('users')} u
    LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
    LEFT JOIN ${tbl('attendances')} a
      ON a.user_id = u.id AND DATE(a.clock_in_time) = ?
    LEFT JOIN ${tbl('teams')} d ON d.id = ed.department_id
    LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
    WHERE u.status = 'active'
    ${deptFilter}
    ORDER BY u.name ASC
  `;

  // params: date+officeStart for TIMESTAMPDIFF, officeStart for CASE WHEN, date for JOIN, optional deptId
  const finalParams = [date, officeStartTime, officeStartTime, date];
  if (departmentId) finalParams.push(departmentId);
  return { sql, finalParams };
}

// GET /api/attendance?date=YYYY-MM-DD&department_id=&status=
router.get('/', requireAuth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const departmentId = req.query.department_id || null;
    const statusFilter = req.query.status || null;
    const officeStartTime = await getOfficeStartTime();

    const { sql, finalParams } = buildAttendanceQuery(date, departmentId, officeStartTime);
    let [rows] = await pool.query(sql, finalParams);

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

// GET /api/attendance/export?date=YYYY-MM-DD&department_id=
router.get('/export', requireAuth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const departmentId = req.query.department_id || null;
    const officeStartTime = await getOfficeStartTime();

    const { sql, finalParams } = buildAttendanceQuery(date, departmentId, officeStartTime);
    const [rows] = await pool.query(sql, finalParams);

    const headers = ['Name', 'Department', 'Designation', 'Clock In', 'Clock Out', 'Delay (min)', 'Hours Worked', 'Status'];
    const csvRows = rows.map(r => [
      `"${r.name}"`,
      `"${r.department || ''}"`,
      `"${r.designation || ''}"`,
      r.clock_in_time ? `"${new Date(r.clock_in_time).toLocaleTimeString()}"` : '"—"',
      r.clock_out_time ? `"${new Date(r.clock_out_time).toLocaleTimeString()}"` : '"—"',
      r.delay_minutes > 0 ? r.delay_minutes : 0,
      r.hours_worked || 0,
      `"${r.attendance_status}"`,
    ]);

    const csv = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance_${date}.csv"`);
    res.send(csv);
  } catch (err) {
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

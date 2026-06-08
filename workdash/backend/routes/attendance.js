const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { getOfficeSettings } = require('../db/officeSettings');
const { requireAuth } = require('../middleware/auth');



function buildAttendanceQuery(date, departmentId, { officeStart, lateMarkDuration }) {
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
      GREATEST(0,
        TIMESTAMPDIFF(MINUTE,
          CASE
            WHEN a.shift_start_time IS NOT NULL
              THEN TIMESTAMPADD(MINUTE, ?, a.shift_start_time)
            ELSE TIMESTAMPADD(MINUTE, ?, CONCAT(?, ' ', ?))
          END,
          a.clock_in_time
        )
      ) AS delay_minutes,
      CASE
        WHEN a.clock_in_time IS NULL THEN 'Absent'
        WHEN a.late = 'yes' THEN 'Late'
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

  // delay params: lateMarkDuration×2, date, officeStart; then date for JOIN, optional deptId
  const finalParams = [lateMarkDuration, lateMarkDuration, date, officeStart, date];
  if (departmentId) finalParams.push(departmentId);
  return { sql, finalParams };
}

// GET /api/attendance?date=YYYY-MM-DD&department_id=&status=
router.get('/', requireAuth, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const departmentId = req.query.department_id || null;
    const statusFilter = req.query.status || null;
    const settings = await getOfficeSettings();

    const { sql, finalParams } = buildAttendanceQuery(date, departmentId, settings);
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
    const settings = await getOfficeSettings();

    const { sql, finalParams } = buildAttendanceQuery(date, departmentId, settings);
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

// GET /api/attendance/trend?days=30
router.get('/trend', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 60);

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM ${tbl('users')} WHERE status = 'active'`
    );

    const [rows] = await pool.query(
      `SELECT
         DATE(clock_in_time) as date,
         COUNT(DISTINCT user_id) as present,
         COUNT(DISTINCT CASE WHEN late = 'yes' THEN user_id END) as late
       FROM ${tbl('attendances')}
       WHERE DATE(clock_in_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND DATE(clock_in_time) <= CURDATE()
       GROUP BY DATE(clock_in_time)
       ORDER BY date ASC`,
      [days - 1]
    );

    const trend = rows.map(r => ({
      date: r.date,
      label: new Date(r.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
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

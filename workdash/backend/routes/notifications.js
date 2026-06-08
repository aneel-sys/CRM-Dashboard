const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { getOfficeSettings } = require('../db/officeSettings');
const { requireAuth } = require('../middleware/auth');

const IST_MS = 5.5 * 60 * 60 * 1000;

// GET /api/notifications
// Returns live alert summaries for the bell dropdown
router.get('/', requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const settings = await getOfficeSettings();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const notifications = [];

    // 1. Late arrivals — use Worksuite's shift-aware late column
    const [lateRows] = await pool.query(
      `SELECT u.name, a.clock_in_time,
              ess.shift_start_time,
              es.late_mark_duration AS shift_late_mark
       FROM ${tbl('attendances')} a
       JOIN ${tbl('users')} u ON u.id = a.user_id
       LEFT JOIN ${tbl('employee_shift_schedules')} ess
         ON ess.user_id = a.user_id AND ess.date = DATE(a.clock_in_time)
       LEFT JOIN ${tbl('employee_shifts')} es ON es.id = ess.employee_shift_id
       WHERE DATE(a.clock_in_time) = ? AND a.late = 'yes'
       ORDER BY a.clock_in_time ASC
       LIMIT 10`,
      [today]
    );

    // Delay = (clock_in - shift_start) in minutes - late_mark_duration
    // Both datetimes are UTC so no IST conversion needed
    const fallbackThresh = (() => {
      const [oh, om] = settings.officeStart.split(':').map(Number);
      return oh * 60 + om + settings.lateMarkDuration;
    })();
    lateRows.forEach(r => {
      if (r.clock_in_time && r.shift_start_time) {
        const diffMins = Math.round((new Date(r.clock_in_time) - new Date(r.shift_start_time)) / 60000);
        const lmDur = r.shift_late_mark != null ? r.shift_late_mark : settings.lateMarkDuration;
        r.delay = Math.max(0, diffMins - lmDur);
      } else if (r.clock_in_time) {
        const local = new Date(new Date(r.clock_in_time).getTime() + IST_MS);
        r.delay = Math.max(0, local.getUTCHours() * 60 + local.getUTCMinutes() - fallbackThresh);
      } else {
        r.delay = 0;
      }
    });

    if (lateRows.length > 0) {
      notifications.push({
        id: 'late-today',
        type: 'warning',
        title: `${lateRows.length} Late Arrival${lateRows.length > 1 ? 's' : ''} Today`,
        detail: lateRows.slice(0, 3).map(r => r.delay > 0 ? `${r.name} (+${r.delay}m)` : r.name).join(', ')
          + (lateRows.length > 3 ? ` +${lateRows.length - 3} more` : ''),
        count: lateRows.length,
        time: 'Today',
      });
    }

    // 2. Absent employees
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM ${tbl('users')} WHERE status = 'active'`
    );
    const [[{ present }]] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as present FROM ${tbl('attendances')}
       WHERE DATE(clock_in_time) = ?`,
      [today]
    );
    const absentCount = total - present;
    if (absentCount > 0) {
      notifications.push({
        id: 'absent-today',
        type: 'error',
        title: `${absentCount} Employee${absentCount > 1 ? 's' : ''} Absent Today`,
        detail: `${present} of ${total} employees have clocked in`,
        count: absentCount,
        time: 'Today',
      });
    }

    // 3. Low attendance this month (< 75%) — holiday-aware working days
    const holidays = await getHolidays(year, month);
    const workingDays = getWorkingDays(year, month, holidays);
    if (workingDays > 0) {
      const threshold = Math.floor(workingDays * 0.75);
      const [lowAttRows] = await pool.query(
        `SELECT u.name,
                COUNT(DISTINCT DATE(a.clock_in_time)) as present_days
         FROM ${tbl('users')} u
         LEFT JOIN ${tbl('attendances')} a
           ON a.user_id = u.id
           AND MONTH(a.clock_in_time) = ? AND YEAR(a.clock_in_time) = ?
         WHERE u.status = 'active'
         GROUP BY u.id, u.name
         HAVING present_days < ?
         ORDER BY present_days ASC
         LIMIT 10`,
        [month, year, threshold]
      );
      if (lowAttRows.length > 0) {
        notifications.push({
          id: 'low-attendance',
          type: 'warning',
          title: `${lowAttRows.length} Employee${lowAttRows.length > 1 ? 's' : ''} Below 75% Attendance`,
          detail: lowAttRows.slice(0, 3).map(r => `${r.name} (${r.present_days}/${workingDays}d)`).join(', ')
            + (lowAttRows.length > 3 ? ` +${lowAttRows.length - 3} more` : ''),
          count: lowAttRows.length,
          time: 'This month',
        });
      }
    }

    // 4. Projects with deadlines in the next 7 days
    const [deadlineRows] = await pool.query(
      `SELECT project_name, deadline, status
       FROM ${tbl('projects')}
       WHERE deadline BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          AND status NOT IN ('completed', 'canceled')
       ORDER BY deadline ASC
       LIMIT 10`
    );
    if (deadlineRows.length > 0) {
      notifications.push({
        id: 'upcoming-deadlines',
        type: 'info',
        title: `${deadlineRows.length} Project Deadline${deadlineRows.length > 1 ? 's' : ''} This Week`,
        detail: deadlineRows.slice(0, 3).map(r => {
          const days = Math.ceil((new Date(r.deadline) - new Date()) / 86400000);
          return `${r.project_name} (${days === 0 ? 'Today' : `${days}d`})`;
        }).join(', ') + (deadlineRows.length > 3 ? ` +${deadlineRows.length - 3} more` : ''),
        count: deadlineRows.length,
        time: 'Next 7 days',
      });
    }

    // 5. Overdue projects
    const [[{ overdueCount }]] = await pool.query(
      `SELECT COUNT(*) as overdueCount FROM ${tbl('projects')}
       WHERE deadline < CURDATE() AND status NOT IN ('completed', 'canceled')`
    );
    if (overdueCount > 0) {
      notifications.push({
        id: 'overdue-projects',
        type: 'error',
        title: `${overdueCount} Overdue Project${overdueCount > 1 ? 's' : ''}`,
        detail: 'Projects past deadline and not yet completed',
        count: overdueCount,
        time: 'Overdue',
      });
    }

    res.json({
      success: true,
      notifications,
      total: notifications.reduce((s, n) => s + n.count, 0),
    });
  } catch (err) {
    console.error('Notifications error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/notifications/expanded — full lists for the Notifications page
router.get('/expanded', requireAuth, async (_req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const settings = await getOfficeSettings();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const holidays = await getHolidays(year, month);
    const workingDays = getWorkingDays(year, month, holidays);

    // Late arrivals — use Worksuite's shift-aware late column + per-shift start time
    const [lateRows] = await pool.query(
      `SELECT u.id, u.name, a.clock_in_time,
              ess.shift_start_time,
              es.late_mark_duration AS shift_late_mark
       FROM ${tbl('attendances')} a
       JOIN ${tbl('users')} u ON u.id = a.user_id
       LEFT JOIN ${tbl('employee_shift_schedules')} ess
         ON ess.user_id = a.user_id AND ess.date = DATE(a.clock_in_time)
       LEFT JOIN ${tbl('employee_shifts')} es ON es.id = ess.employee_shift_id
       WHERE DATE(a.clock_in_time) = ? AND a.late = 'yes'
       ORDER BY a.clock_in_time ASC`,
      [today]
    );

    const fallbackThresh = (() => {
      const [oh, om] = settings.officeStart.split(':').map(Number);
      return oh * 60 + om + settings.lateMarkDuration;
    })();
    lateRows.forEach(r => {
      if (r.clock_in_time && r.shift_start_time) {
        const diffMins = Math.round((new Date(r.clock_in_time) - new Date(r.shift_start_time)) / 60000);
        const lmDur = r.shift_late_mark != null ? r.shift_late_mark : settings.lateMarkDuration;
        r.delay = Math.max(0, diffMins - lmDur);
      } else if (r.clock_in_time) {
        const local = new Date(new Date(r.clock_in_time).getTime() + IST_MS);
        r.delay = Math.max(0, local.getUTCHours() * 60 + local.getUTCMinutes() - fallbackThresh);
      } else {
        r.delay = 0;
      }
    });

    const [presentRows] = await pool.query(
      `SELECT DISTINCT user_id FROM ${tbl('attendances')} WHERE DATE(clock_in_time) = ?`, [today]
    );
    const presentIds = new Set(presentRows.map(r => r.user_id));

    const [allUsers] = await pool.query(
      `SELECT u.id, u.name, ed.department_id
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       WHERE u.status = 'active' ORDER BY u.name`
    );
    const absentRows = allUsers.filter(u => !presentIds.has(u.id));

    const threshold = workingDays > 0 ? Math.floor(workingDays * 0.75) : 0;
    const [lowAttRows] = await pool.query(
      `SELECT u.id, u.name,
              COUNT(DISTINCT DATE(a.clock_in_time)) as present_days
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl('attendances')} a ON a.user_id = u.id
         AND MONTH(a.clock_in_time) = ? AND YEAR(a.clock_in_time) = ?
       WHERE u.status = 'active'
       GROUP BY u.id, u.name
       HAVING present_days < ?
       ORDER BY present_days ASC`,
      [month, year, threshold]
    );

    const [deadlineRows] = await pool.query(
      `SELECT id, project_name, deadline, status
       FROM ${tbl('projects')}
       WHERE deadline BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         AND status NOT IN ('completed','canceled')
       ORDER BY deadline ASC`
    );

    const [overdueRows] = await pool.query(
      `SELECT id, project_name, deadline, status
       FROM ${tbl('projects')}
       WHERE deadline < CURDATE() AND status NOT IN ('completed','canceled')
       ORDER BY deadline ASC
       LIMIT 50`
    );

    res.json({
      success: true,
      workingDays,
      month,
      year,
      lateToday: lateRows,
      absentToday: absentRows,
      lowAttendance: lowAttRows.map(r => ({ ...r, workingDays })),
      upcomingDeadlines: deadlineRows,
      overdueProjects: overdueRows,
    });
  } catch (err) {
    console.error('Notifications expanded error:', err.message);
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

function getWorkingDays(year, month, holidays = new Set()) {
  const date = new Date(year, month - 1, 1);
  let count = 0;
  while (date.getMonth() === month - 1) {
    const day = date.getDay();
    const ds = date.toISOString().slice(0, 10);
    if (day !== 0 && !holidays.has(ds)) count++;
    date.setDate(date.getDate() + 1);
  }
  return count;
}

module.exports = router;

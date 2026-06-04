const express = require('express');
const router = express.Router();
const { pool, tbl } = require('../db/connection');
const { getOfficeStartTime } = require('../db/officeSettings');
const { requireAuth } = require('../middleware/auth');

// GET /api/notifications
// Returns live alerts: late arrivals, absent, low attendance, upcoming deadlines
router.get('/', requireAuth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const officeStart = await getOfficeStartTime();
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    const notifications = [];

    // 1. Late arrivals today
    const [lateRows] = await pool.query(
      `SELECT u.name, TIME(a.clock_in_time) as clock_in,
              TIMESTAMPDIFF(MINUTE, CONCAT(DATE(a.clock_in_time), ' ', ?), a.clock_in_time) as delay
       FROM ${tbl('attendances')} a
       JOIN ${tbl('users')} u ON u.id = a.user_id
       WHERE DATE(a.clock_in_time) = ?
         AND TIME(a.clock_in_time) > ?
       ORDER BY delay DESC
       LIMIT 10`,
      [officeStart, today, officeStart]
    );
    if (lateRows.length > 0) {
      notifications.push({
        id: 'late-today',
        type: 'warning',
        title: `${lateRows.length} Late Arrival${lateRows.length > 1 ? 's' : ''} Today`,
        detail: lateRows.slice(0, 3).map(r => `${r.name} (+${r.delay}m)`).join(', ')
          + (lateRows.length > 3 ? ` +${lateRows.length - 3} more` : ''),
        count: lateRows.length,
        time: 'Today',
      });
    }

    // 2. Absent employees (active users with no clock-in today)
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

    // 3. Employees with low attendance this month (< 75%)
    const workingDays = getWorkingDays(year, month);
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

    // 5. Overdue projects (deadline passed, not completed)
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

function getWorkingDays(year, month) {
  const date = new Date(year, month - 1, 1);
  let count = 0;
  while (date.getMonth() === month - 1) {
    const d = date.getDay();
    if (d !== 0 && d !== 6) count++;
    date.setDate(date.getDate() + 1);
  }
  return count;
}

module.exports = router;

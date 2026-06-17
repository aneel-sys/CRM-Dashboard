const { pool, tbl }        = require('../db/connection');
const { getOfficeSettings } = require('../db/officeSettings');
const sse                   = require('./sse');

const IST_MS   = 5.5 * 60 * 60 * 1000;
const INTERVAL = 30_000;

// ─── helpers ────────────────────────────────────────────────────────────────

function toISTMins(utcDate) {
  const d = new Date(new Date(utcDate).getTime() + IST_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

async function getHolidays(year, month) {
  try {
    const [rows] = await pool.query(
      `SELECT DATE_FORMAT(date,'%Y-%m-%d') as d FROM ${tbl('holidays')}
       WHERE YEAR(date)=? AND MONTH(date)=?`, [year, month]);
    return new Set(rows.map(r => r.d));
  } catch { return new Set(); }
}

function workingDays(year, month, holidays = new Set()) {
  const d = new Date(year, month - 1, 1); let n = 0;
  while (d.getMonth() === month - 1) {
    if (d.getDay() !== 0 && !holidays.has(d.toISOString().slice(0, 10))) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

// ─── main fetch ─────────────────────────────────────────────────────────────

async function broadcast() {
  if (!sse.count()) return;

  const today    = new Date().toISOString().slice(0, 10);
  const now      = new Date();
  const month    = now.getMonth() + 1;
  const year     = now.getFullYear();

  try {
    // ── OVERVIEW (time-sensitive part only) ──────────────────────────────
    const settings = await getOfficeSettings();

    const [[{ total }]]   = await pool.query(`SELECT COUNT(*) as total FROM ${tbl('users')} WHERE status='active'`);
    const [[{ present }]] = await pool.query(`SELECT COUNT(DISTINCT user_id) as present FROM ${tbl('attendances')} WHERE DATE(clock_in_time)=?`, [today]);
    const [[{ late }]]    = await pool.query(`SELECT COUNT(*) as late FROM ${tbl('attendances')} WHERE DATE(clock_in_time)=? AND late='yes'`, [today]);

    const absent = total - present;

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
    } catch {}

    const [lateRows] = await pool.query(
      `SELECT u.id, u.name, u.email,
              d.team_name as department, ds.name as designation,
              a.clock_in_time, a.clock_out_time,
              ess.shift_start_time
       FROM ${tbl('attendances')} a
       JOIN ${tbl('users')} u ON u.id=a.user_id
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id=u.id
       LEFT JOIN ${tbl('teams')} d ON d.id=ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id=ed.designation_id
       LEFT JOIN ${tbl('employee_shift_schedules')} ess
         ON ess.user_id=a.user_id AND ess.date=DATE(a.clock_in_time)
       WHERE DATE(a.clock_in_time)=? AND a.late='yes'
       ORDER BY a.clock_in_time ASC LIMIT 5`, [today]);

    const fallback = (() => {
      const [oh, om] = settings.officeStart.split(':').map(Number);
      return oh * 60 + om;
    })();
    lateRows.forEach(r => {
      if (r.clock_in_time && r.shift_start_time) {
        const shift = new Date(r.shift_start_time);
        r.delay_minutes = Math.max(0, toISTMins(r.clock_in_time) - (shift.getUTCHours() * 60 + shift.getUTCMinutes()));
      } else if (r.clock_in_time) {
        r.delay_minutes = Math.max(0, toISTMins(r.clock_in_time) - fallback);
      } else { r.delay_minutes = 0; }
    });

    let currentlyWorking = { count: 0, list: [] };
    try {
      const [[{ count }]] = await pool.query(
        `SELECT COUNT(DISTINCT a.user_id) as count FROM ${tbl('attendances')} a
         WHERE DATE(a.clock_in_time)=? AND a.clock_in_time IS NOT NULL AND a.clock_out_time IS NULL`, [today]);
      const [list] = await pool.query(
        `SELECT u.id, u.name, a.clock_in_time
         FROM ${tbl('attendances')} a JOIN ${tbl('users')} u ON u.id=a.user_id
         WHERE DATE(a.clock_in_time)=? AND a.clock_in_time IS NOT NULL AND a.clock_out_time IS NULL
         ORDER BY a.clock_in_time ASC LIMIT 8`, [today]);
      currentlyWorking = { count, list };
    } catch {}

    sse.broadcast('overview', {
      date: today,
      stats: { total, present, late, absent, onLeave: on_leave },
      lateArrivals: lateRows,
      attendanceBreakdown: { present, onLeave: on_leave, absent: Math.max(0, absent - on_leave) },
      currentlyWorking,
    });
  } catch (err) {
    console.error('[broadcaster] overview error:', err.message);
  }

  // ── NOTIFICATIONS ──────────────────────────────────────────────────────
  try {
    const settings = await getOfficeSettings();
    const notifications = [];

    const [lateRows] = await pool.query(
      `SELECT u.name, a.clock_in_time, ess.shift_start_time
       FROM ${tbl('attendances')} a
       JOIN ${tbl('users')} u ON u.id=a.user_id
       LEFT JOIN ${tbl('employee_shift_schedules')} ess
         ON ess.user_id=a.user_id AND ess.date=DATE(a.clock_in_time)
       WHERE DATE(a.clock_in_time)=? AND a.late='yes'
       ORDER BY a.clock_in_time ASC LIMIT 10`, [today]);

    const fallback = (() => {
      const [oh, om] = settings.officeStart.split(':').map(Number);
      return oh * 60 + om;
    })();
    lateRows.forEach(r => {
      if (r.clock_in_time && r.shift_start_time) {
        const ss = new Date(r.shift_start_time);
        r.delay = Math.max(0, toISTMins(r.clock_in_time) - (ss.getUTCHours() * 60 + ss.getUTCMinutes()));
      } else if (r.clock_in_time) {
        r.delay = Math.max(0, toISTMins(r.clock_in_time) - fallback);
      } else { r.delay = 0; }
    });
    if (lateRows.length > 0) {
      notifications.push({
        id: 'late-today', type: 'warning',
        title: `${lateRows.length} Late Arrival${lateRows.length > 1 ? 's' : ''} Today`,
        detail: lateRows.slice(0, 3).map(r => r.delay > 0 ? `${r.name} (+${r.delay}m)` : r.name).join(', ')
          + (lateRows.length > 3 ? ` +${lateRows.length - 3} more` : ''),
        count: lateRows.length, time: 'Today',
      });
    }

    const [[{ totalU }]] = await pool.query(`SELECT COUNT(*) as totalU FROM ${tbl('users')} WHERE status='active'`);
    const [[{ presentU }]] = await pool.query(`SELECT COUNT(DISTINCT user_id) as presentU FROM ${tbl('attendances')} WHERE DATE(clock_in_time)=?`, [today]);
    const absentCount = totalU - presentU;
    if (absentCount > 0) {
      notifications.push({
        id: 'absent-today', type: 'error',
        title: `${absentCount} Employee${absentCount > 1 ? 's' : ''} Absent Today`,
        detail: `${presentU} of ${totalU} employees have clocked in`,
        count: absentCount, time: 'Today',
      });
    }

    const holidays = await getHolidays(year, month);
    const wDays = workingDays(year, month, holidays);
    if (wDays > 0) {
      const threshold = Math.floor(wDays * 0.75);
      const [lowAtt] = await pool.query(
        `SELECT u.name, COUNT(DISTINCT DATE(a.clock_in_time)) as pd
         FROM ${tbl('users')} u
         LEFT JOIN ${tbl('attendances')} a ON a.user_id=u.id
           AND MONTH(a.clock_in_time)=? AND YEAR(a.clock_in_time)=?
         WHERE u.status='active'
         GROUP BY u.id, u.name HAVING pd<? ORDER BY pd ASC LIMIT 10`,
        [month, year, threshold]);
      if (lowAtt.length > 0) {
        notifications.push({
          id: 'low-attendance', type: 'warning',
          title: `${lowAtt.length} Employee${lowAtt.length > 1 ? 's' : ''} Below 75% Attendance`,
          detail: lowAtt.slice(0, 3).map(r => `${r.name} (${r.pd}/${wDays}d)`).join(', ')
            + (lowAtt.length > 3 ? ` +${lowAtt.length - 3} more` : ''),
          count: lowAtt.length, time: 'This month',
        });
      }
    }

    const [deadlines] = await pool.query(
      `SELECT project_name, deadline FROM ${tbl('projects')}
       WHERE deadline BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
         AND status NOT IN ('completed','canceled')
       ORDER BY deadline ASC LIMIT 10`);
    if (deadlines.length > 0) {
      notifications.push({
        id: 'upcoming-deadlines', type: 'info',
        title: `${deadlines.length} Project Deadline${deadlines.length > 1 ? 's' : ''} This Week`,
        detail: deadlines.slice(0, 3).map(r => {
          const d = Math.ceil((new Date(r.deadline) - new Date()) / 86400000);
          return `${r.project_name} (${d === 0 ? 'Today' : `${d}d`})`;
        }).join(', ') + (deadlines.length > 3 ? ` +${deadlines.length - 3} more` : ''),
        count: deadlines.length, time: 'Next 7 days',
      });
    }

    const [[{ overdueCount }]] = await pool.query(
      `SELECT COUNT(*) as overdueCount FROM ${tbl('projects')}
       WHERE deadline < CURDATE() AND status NOT IN ('completed','canceled')`);
    if (overdueCount > 0) {
      notifications.push({
        id: 'overdue-projects', type: 'error',
        title: `${overdueCount} Overdue Project${overdueCount > 1 ? 's' : ''}`,
        detail: 'Projects past deadline and not yet completed',
        count: overdueCount, time: 'Overdue',
      });
    }

    sse.broadcast('notifications', {
      notifications,
      total: notifications.reduce((s, n) => s + n.count, 0),
    });
  } catch (err) {
    console.error('[broadcaster] notifications error:', err.message);
  }

  // tick — any page can react to this
  sse.broadcast('tick', { ts: Date.now(), date: new Date().toISOString().slice(0, 10) });
}

// ─── public API ─────────────────────────────────────────────────────────────

let timer = null;

module.exports = {
  start() {
    if (timer) return;
    // First push ~2s after server start so initial page loads are already cached
    setTimeout(broadcast, 2000);
    timer = setInterval(broadcast, INTERVAL);
    console.log('[broadcaster] started — interval', INTERVAL / 1000, 's');
  },
};

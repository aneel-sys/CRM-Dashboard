const express = require('express');
const router  = express.Router();
const { pool, tbl } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { getOfficeSettings } = require('../db/officeSettings');

// GET /api/hr/dept-comparison?days=30 — attendance %, punctuality %, avg hours per department
router.get('/dept-comparison', requireAuth, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 90);
    const settings = await getOfficeSettings();
    const openDays = (settings.officeOpenDays || [1, 2, 3, 4, 5]).map(d => Number(d) === 7 ? 0 : Number(d));
    const capMins = Math.round((settings.workHoursPerDay || 9) * 60);

    let holidaySet = new Set();
    try {
      const [hrows] = await pool.query(
        `SELECT DATE_FORMAT(date, '%Y-%m-%d') as d FROM ${tbl('holidays')}
         WHERE date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND date <= CURDATE()`,
        [days - 1]
      );
      holidaySet = new Set(hrows.map(r => r.d));
    } catch {}

    // Working days inside the window
    let workingDays = 0;
    const d = new Date();
    for (let i = 0; i < days; i++) {
      const ds = d.toISOString().slice(0, 10);
      if (openDays.includes(d.getUTCDay()) && !holidaySet.has(ds)) workingDays++;
      d.setUTCDate(d.getUTCDate() - 1);
    }

    const [rows] = await pool.query(
      `SELECT d.id, d.team_name as department,
              COUNT(DISTINCT u.id) as headcount,
              COUNT(DISTINCT CASE WHEN a.id IS NOT NULL THEN CONCAT(a.user_id, ':', DATE(a.clock_in_time)) END) as present_days,
              COUNT(DISTINCT CASE WHEN a.late = 'no' THEN CONCAT(a.user_id, ':', DATE(a.clock_in_time)) END) as ontime_days,
              ROUND(SUM(CASE WHEN a.id IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, a.clock_in_time,
                CASE WHEN a.clock_out_time IS NOT NULL THEN a.clock_out_time
                     WHEN DATE(a.clock_in_time) = UTC_DATE() THEN NOW()
                     ELSE DATE_ADD(a.clock_in_time, INTERVAL ${capMins} MINUTE) END) ELSE 0 END) / 60, 1) as total_hours
       FROM ${tbl('teams')} d
       JOIN ${tbl('employee_details')} ed ON ed.department_id = d.id
       JOIN ${tbl('users')} u ON u.id = ed.user_id AND u.status = 'active'
       LEFT JOIN ${tbl('attendances')} a
         ON a.user_id = u.id AND DATE(a.clock_in_time) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       GROUP BY d.id, d.team_name
       ORDER BY d.team_name ASC`,
      [days - 1]
    );

    const departments = rows
      .filter(r => Number(r.headcount) > 0)
      .map(r => {
        const headcount = Number(r.headcount);
        const presentDays = Number(r.present_days);
        const possible = headcount * workingDays;
        return {
          department: r.department,
          headcount,
          presentDays,
          possibleDays: possible,
          attendancePct: possible > 0 ? Math.min(100, Math.round((presentDays / possible) * 100)) : 0,
          punctualityPct: presentDays > 0 ? Math.round((Number(r.ontime_days) / presentDays) * 100) : 0,
          avgHours: presentDays > 0 ? Math.round((parseFloat(r.total_hours) / presentDays) * 10) / 10 : 0,
        };
      });

    res.json({ success: true, departments, days, workingDays });
  } catch (err) {
    console.error('Dept comparison error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/summary — KPI cards
router.get('/summary', requireAuth, async (req, res) => {
  try {
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM ${tbl('users')} WHERE status = 'active'`
    );
    const [[{ newJoiners }]] = await pool.query(
      `SELECT COUNT(*) as newJoiners FROM ${tbl('employee_details')} ed
       JOIN ${tbl('users')} u ON u.id = ed.user_id
       WHERE u.status = 'active'
         AND MONTH(ed.joining_date) = MONTH(CURDATE())
         AND YEAR(ed.joining_date)  = YEAR(CURDATE())`
    );
    const [[{ onNotice }]] = await pool.query(
      `SELECT COUNT(*) as onNotice FROM ${tbl('employee_details')} ed
       JOIN ${tbl('users')} u ON u.id = ed.user_id
       WHERE u.status = 'active'
         AND ed.notice_period_start_date IS NOT NULL
         AND (ed.notice_period_end_date IS NULL OR ed.notice_period_end_date >= CURDATE())`
    );
    const [[{ onProbation }]] = await pool.query(
      `SELECT COUNT(*) as onProbation FROM ${tbl('employee_details')} ed
       JOIN ${tbl('users')} u ON u.id = ed.user_id
       WHERE u.status = 'active'
         AND ed.probation_end_date IS NOT NULL
         AND ed.probation_end_date >= CURDATE()`
    );
    res.json({ success: true, total: Number(total), newJoiners: Number(newJoiners), onNotice: Number(onNotice), onProbation: Number(onProbation) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/headcount — employees per department
router.get('/headcount', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.team_name as department, COUNT(u.id) as count
       FROM ${tbl('users')} u
       JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       JOIN ${tbl('teams')} t ON t.id = ed.department_id
       WHERE u.status = 'active'
       GROUP BY t.id, t.team_name
       ORDER BY count DESC
       LIMIT 10`
    );
    res.json({ success: true, headcount: rows.map(r => ({ department: r.department, count: Number(r.count) })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/gender
router.get('/gender', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT COALESCE(gender, 'others') as gender, COUNT(*) as count
       FROM ${tbl('users')} WHERE status = 'active'
       GROUP BY gender ORDER BY count DESC`
    );
    res.json({ success: true, gender: rows.map(r => ({ gender: r.gender, count: Number(r.count) })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/employment-types
router.get('/employment-types', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT COALESCE(NULLIF(TRIM(ed.employment_type), ''), 'Not specified') as type, COUNT(*) as count
       FROM ${tbl('users')} u
       JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       WHERE u.status = 'active'
       GROUP BY ed.employment_type ORDER BY count DESC`
    );
    res.json({ success: true, types: rows.map(r => ({ type: r.type, count: Number(r.count) })) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/leave-balances — aggregate by leave type
router.get('/leave-balances', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT lt.id, lt.type_name, lt.color, lt.no_of_leaves as quota_per_person,
              ROUND(SUM(elq.no_of_leaves), 1)    as total_quota,
              ROUND(SUM(elq.leaves_used), 1)      as total_used,
              ROUND(SUM(elq.leaves_remaining), 1) as total_remaining,
              COUNT(DISTINCT elq.user_id)          as employees
       FROM ${tbl('leave_types')} lt
       JOIN ${tbl('employee_leave_quotas')} elq ON elq.leave_type_id = lt.id
       WHERE lt.deleted_at IS NULL
       GROUP BY lt.id, lt.type_name, lt.color, lt.no_of_leaves
       ORDER BY lt.id`
    );
    res.json({ success: true, balances: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/departments — for filter dropdown
router.get('/departments', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.id, t.team_name as name
       FROM ${tbl('teams')} t
       JOIN ${tbl('employee_details')} ed ON ed.department_id = t.id
       JOIN ${tbl('users')} u ON u.id = ed.user_id AND u.status = 'active'
       GROUP BY t.id, t.team_name
       ORDER BY t.team_name ASC`
    );
    res.json({ success: true, departments: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/employees?search=&dept=&page=1
router.get('/employees', requireAuth, async (req, res) => {
  try {
    const { search = '', dept = '', page = 1 } = req.query;
    const limit  = 15;
    const offset = (Math.max(1, parseInt(page)) - 1) * limit;

    const conditions = ['u.status = ?'];
    const params     = ['active'];
    if (search) { conditions.push('(u.name LIKE ? OR u.email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (dept)   { conditions.push('ed.department_id = ?'); params.push(dept); }
    const where = conditions.join(' AND ');

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       WHERE ${where}`,
      params
    );
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.gender, u.mobile,
              t.team_name as department, ds.name as designation,
              DATE_FORMAT(ed.joining_date, '%Y-%m-%d') as joining_date,
              ed.employment_type,
              DATE_FORMAT(ed.probation_end_date, '%Y-%m-%d')      as probation_end_date,
              DATE_FORMAT(ed.contract_end_date, '%Y-%m-%d')       as contract_end_date,
              DATE_FORMAT(ed.notice_period_start_date, '%Y-%m-%d') as notice_period_start_date,
              DATE_FORMAT(ed.notice_period_end_date, '%Y-%m-%d')   as notice_period_end_date
       FROM ${tbl('users')} u
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} t  ON t.id  = ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
       WHERE ${where}
       ORDER BY u.name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json({ success: true, employees: rows, total: Number(total), page: parseInt(page), limit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/new-joiners — joined in last 30 days
router.get('/new-joiners', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.email, u.gender,
              t.team_name as department, ds.name as designation,
              DATE_FORMAT(ed.joining_date, '%Y-%m-%d') as joining_date,
              ed.employment_type
       FROM ${tbl('users')} u
       JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} t  ON t.id  = ed.department_id
       LEFT JOIN ${tbl('designations')} ds ON ds.id = ed.designation_id
       WHERE u.status = 'active'
         AND ed.joining_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       ORDER BY ed.joining_date DESC
       LIMIT 10`
    );
    res.json({ success: true, joiners: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/expiring — probation/contract/notice ending within 30 days
router.get('/expiring', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, t.team_name as department,
              DATE_FORMAT(ed.probation_end_date,       '%Y-%m-%d') as probation_end_date,
              DATE_FORMAT(ed.contract_end_date,        '%Y-%m-%d') as contract_end_date,
              DATE_FORMAT(ed.notice_period_end_date,   '%Y-%m-%d') as notice_period_end_date,
              ed.employment_type,
              CASE
                WHEN ed.notice_period_end_date  BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'notice'
                WHEN ed.probation_end_date       BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'probation'
                WHEN ed.contract_end_date        BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'contract'
              END as expiry_type
       FROM ${tbl('users')} u
       JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} t ON t.id = ed.department_id
       WHERE u.status = 'active'
         AND (
           (ed.notice_period_end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY))
           OR (ed.probation_end_date   BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY))
           OR (ed.contract_end_date    BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY))
         )
       ORDER BY LEAST(
         COALESCE(ed.notice_period_end_date, '9999-12-31'),
         COALESCE(ed.probation_end_date,     '9999-12-31'),
         COALESCE(ed.contract_end_date,      '9999-12-31')
       ) ASC
       LIMIT 10`
    );
    res.json({ success: true, expiring: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/leave-usage?period=year|month — top 5 employees by leave taken
router.get('/leave-usage', requireAuth, async (req, res) => {
  try {
    // This Month — count approved leave days from the leaves table directly.
    // (Quota used/remaining are yearly figures, so they only apply to period=year.)
    if (req.query.period === 'month') {
      const [rows] = await pool.query(
        `SELECT u.id, u.name, t.team_name as department,
                lt.type_name, lt.color,
                SUM(CASE WHEN l.duration = 'half day' THEN 0.5 ELSE 1 END) as used
         FROM ${tbl('leaves')} l
         JOIN ${tbl('users')} u ON u.id = l.user_id AND u.status = 'active'
         LEFT JOIN ${tbl('leave_types')} lt ON lt.id = l.leave_type_id
         LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
         LEFT JOIN ${tbl('teams')} t ON t.id = ed.department_id
         WHERE l.status = 'approved'
           AND MONTH(l.leave_date) = MONTH(CURDATE()) AND YEAR(l.leave_date) = YEAR(CURDATE())
         GROUP BY u.id, u.name, t.team_name, lt.id, lt.type_name, lt.color`,
      );
      const map = {};
      rows.forEach(r => {
        if (!map[r.id]) map[r.id] = {
          id: r.id, name: r.name, department: r.department,
          types: [], totalUsed: 0, totalRemaining: null,
        };
        const used = parseFloat(r.used) || 0;
        map[r.id].types.push({ type_name: r.type_name || 'Leave', color: r.color, used, allocated: 0, remaining: null });
        map[r.id].totalUsed += used;
      });
      const employees = Object.values(map)
        .sort((a, b) => b.totalUsed - a.totalUsed)
        .slice(0, 5);
      return res.json({ success: true, employees, withLeave: Object.keys(map).length, period: 'month' });
    }

    // top 5 employees by total leaves used
    const [topRows] = await pool.query(
      `SELECT u.id, u.name, t.team_name as department,
              lt.id as type_id, lt.type_name, lt.color,
              elq.leaves_used as used,
              elq.no_of_leaves as allocated,
              elq.leaves_remaining as remaining
       FROM (
         SELECT u2.id, SUM(e2.leaves_used) as total_used
         FROM ${tbl('users')} u2
         JOIN ${tbl('employee_leave_quotas')} e2 ON e2.user_id = u2.id
         WHERE u2.status = 'active'
         GROUP BY u2.id
         HAVING total_used > 0
         ORDER BY total_used DESC
         LIMIT 5
       ) top
       JOIN ${tbl('users')} u ON u.id = top.id
       JOIN ${tbl('employee_leave_quotas')} elq ON elq.user_id = u.id
       JOIN ${tbl('leave_types')} lt ON lt.id = elq.leave_type_id AND lt.deleted_at IS NULL
       LEFT JOIN ${tbl('employee_details')} ed ON ed.user_id = u.id
       LEFT JOIN ${tbl('teams')} t ON t.id = ed.department_id
       ORDER BY top.total_used DESC, lt.id ASC`
    );

    // total employees with any leave used
    const [[{ withLeave }]] = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as withLeave
       FROM ${tbl('employee_leave_quotas')}
       WHERE leaves_used > 0`
    );

    // group by employee
    const map = {};
    topRows.forEach(r => {
      if (!map[r.id]) map[r.id] = {
        id: r.id, name: r.name, department: r.department,
        types: [], totalUsed: 0, totalRemaining: 0,
      };
      const used = parseFloat(r.used) || 0;
      const rem  = parseFloat(r.remaining) || 0;
      map[r.id].types.push({ type_name: r.type_name, color: r.color, used, allocated: parseFloat(r.allocated) || 0, remaining: rem });
      map[r.id].totalUsed      += used;
      map[r.id].totalRemaining += rem;
    });

    res.json({ success: true, employees: Object.values(map), withLeave: Number(withLeave) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/hr/leave-balance/:userId — per-employee leave quota
router.get('/leave-balance/:userId', requireAuth, async (req, res) => {
  try {
    const { userId } = req.params;
    const [rows] = await pool.query(
      `SELECT lt.id, lt.type_name, lt.color, lt.no_of_leaves as quota,
              COALESCE(elq.no_of_leaves, lt.no_of_leaves)  as allocated,
              COALESCE(elq.leaves_used, 0)                 as used,
              COALESCE(elq.leaves_remaining, lt.no_of_leaves) as remaining
       FROM ${tbl('leave_types')} lt
       LEFT JOIN ${tbl('employee_leave_quotas')} elq
         ON elq.leave_type_id = lt.id AND elq.user_id = ?
       WHERE lt.deleted_at IS NULL
       ORDER BY lt.id`,
      [userId]
    );
    res.json({ success: true, leaveBalance: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

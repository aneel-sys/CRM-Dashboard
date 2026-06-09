const express = require('express');
const router  = express.Router();
const { pool, tbl } = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

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

/**
 * Office Settings Helper
 * 
 * Fetches office timing configuration from the Worksuite `attendance_settings` table
 * instead of relying on hardcoded environment variables.
 * 
 * Actual DB columns (confirmed):
 *   office_start_time  TIME  e.g. 09:00:00
 *   office_end_time    TIME  e.g. 18:00:00
 *   halfday_mark_time  TIME  e.g. 13:00:00
 *   late_mark_duration INT   e.g. 20 (minutes grace before marking late)
 *   office_open_days   VARCHAR e.g. [1,2,3,4,5] (1=Mon … 7=Sun)
 * 
 * Results are cached for 5 minutes to avoid hitting the DB on every request.
 */
const { pool, tbl } = require('./connection');

let _cache = { data: null, ts: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the default office start time from the database.
 * @returns {Promise<string>} e.g. '09:00'
 */
async function getOfficeStartTime() {
  const settings = await getOfficeSettings();
  return settings.officeStart;
}

/**
 * Get full office settings from the `attendance_settings` table.
 * @returns {Promise<Object>}
 */
async function getOfficeSettings() {
  const now = Date.now();
  if (_cache.data && now - _cache.ts < CACHE_TTL) {
    return _cache.data;
  }

  try {
    const settings = await fetchFromDB();
    _cache = { data: settings, ts: Date.now() };
    return settings;
  } catch (err) {
    console.error('Failed to fetch office settings from DB:', err.message);
    // Fallback defaults
    return {
      officeStart: '09:00',
      officeEnd: '18:00',
      workHoursPerDay: 9,
      lateMarkDuration: 0,
      officeOpenDays: [1, 2, 3, 4, 5],
      halfdayMarkTime: '13:00',
    };
  }
}

/**
 * Fetch from Worksuite `attendance_settings` table.
 */
async function fetchFromDB() {
  const [rows] = await pool.query(
    `SELECT office_start_time, office_end_time, halfday_mark_time,
            late_mark_duration, office_open_days
     FROM ${tbl('attendance_settings')}
     LIMIT 1`
  );

  if (rows.length > 0) {
    const row = rows[0];
    const officeStart = formatTime(row.office_start_time);
    const officeEnd = formatTime(row.office_end_time);
    const workHoursPerDay = calcHoursDiff(officeStart, officeEnd);
    const lateMarkDuration = parseInt(row.late_mark_duration) || 0;
    const halfdayMarkTime = formatTime(row.halfday_mark_time);

    // Parse office_open_days: stored as "[1,2,3,4,5]" string
    let officeOpenDays = [1, 2, 3, 4, 5];
    try {
      if (row.office_open_days) {
        officeOpenDays = JSON.parse(row.office_open_days);
      }
    } catch { /* keep default */ }

    return { officeStart, officeEnd, workHoursPerDay, lateMarkDuration, officeOpenDays, halfdayMarkTime };
  }

  // No rows found — use defaults
  return {
    officeStart: '09:00',
    officeEnd: '18:00',
    workHoursPerDay: 9,
    lateMarkDuration: 0,
    officeOpenDays: [1, 2, 3, 4, 5],
    halfdayMarkTime: '13:00',
  };
}

/** Extract HH:mm from TIME column (e.g. "09:00:00" → "09:00") */
function formatTime(val) {
  if (!val) return '09:00';
  const str = String(val);
  const match = str.match(/(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '09:00';
}

/** Calculate hours between two HH:mm strings */
function calcHoursDiff(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return Math.max(1, Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60));
}

module.exports = { getOfficeStartTime, getOfficeSettings };

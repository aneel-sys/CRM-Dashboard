const mysql = require('mysql2/promise');
require('dotenv').config();

// Force 'localhost' → '127.0.0.1' to avoid IPv6 (::1) connection on Linux
const dbHost = (process.env.DB_HOST || 'localhost') === 'localhost' ? '127.0.0.1' : process.env.DB_HOST;

const pool = mysql.createPool({
  host: dbHost,
  port: parseInt(process.env.DB_PORT) || 3306,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
  // Force IPv4 — Hostinger's MySQL rejects ::1 (IPv6 localhost)
  enableKeepAlive: true,
});

// Table name helper — prepends prefix if set
const prefix = process.env.DB_PREFIX || '';
const tbl = (name) => `${prefix}${name}`;

// Verify connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

module.exports = { pool, tbl };

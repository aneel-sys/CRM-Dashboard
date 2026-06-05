const mysql = require('mysql2/promise');
require('dotenv').config();

const dbHost = process.env.DB_HOST || 'localhost';

// Build connection config — use Unix socket for localhost (Hostinger MySQL
// grants 'user'@'localhost' = socket only, TCP 127.0.0.1 is rejected).
const poolConfig = {
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
  enableKeepAlive: true,
};

if (dbHost === 'localhost') {
  // Try common socket paths on Hostinger shared hosting
  const socketPath = process.env.DB_SOCKET || '/var/lib/mysql/mysql.sock';
  poolConfig.socketPath = socketPath;
  console.log(`🔌 MySQL connecting via socket: ${socketPath}`);
} else {
  poolConfig.host = dbHost;
  poolConfig.port = parseInt(process.env.DB_PORT) || 3306;
  console.log(`🔌 MySQL connecting via TCP: ${dbHost}:${poolConfig.port}`);
}

const pool = mysql.createPool(poolConfig);

// Table name helper — prepends prefix if set
const prefix = process.env.DB_PREFIX || '';
const tbl = (name) => `${prefix}${name}`;

// Debug: log masked credentials to diagnose auth issues (remove after fix)
const maskPwd = (s) => s ? `${s.slice(0,3)}${'*'.repeat(s.length - 5)}${s.slice(-2)} (len=${s.length})` : 'EMPTY';
console.log(`🔑 DB config → host=${dbHost}, user=${process.env.DB_USER}, db=${process.env.DB_NAME}, pass=${maskPwd(process.env.DB_PASS)}`);

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

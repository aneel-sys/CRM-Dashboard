const mysql = require('mysql2/promise');
require('dotenv').config();

// Hostinger shared MySQL only permits socket connections for @'localhost' users.
// TCP via 127.0.0.1 is rejected. Use the Unix socket instead.
const pool = mysql.createPool({
  socketPath: process.env.DB_SOCKET || '/var/lib/mysql/mysql.sock',
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
});

const prefix = process.env.DB_PREFIX || '';
const tbl = (name) => `${prefix}${name}`;

pool.getConnection()
  .then(conn => {
    console.log('✅ Database connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });

module.exports = { pool, tbl };

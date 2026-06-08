require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const FileStore = require('session-file-store')(session);

const authRoutes       = require('./routes/auth');
const overviewRoutes   = require('./routes/overview');
const attendanceRoutes = require('./routes/attendance');
const employeeRoutes   = require('./routes/employees');
const projectRoutes    = require('./routes/projects');
const timingsRoutes    = require('./routes/timings');
const teamRoutes       = require('./routes/team');
const notificationRoutes = require('./routes/notifications');
const settingsRoutes   = require('./routes/settings');
const streamRoutes     = require('./routes/stream');
const broadcaster      = require('./lib/broadcaster');

const app = express();
// Hostinger managed Node.js injects PORT automatically — use it first.
// APP_PORT is used as fallback for local development.
const PORT = process.env.PORT || process.env.APP_PORT || 5000;
const isProd = process.env.NODE_ENV === 'production';

// Trust reverse proxy so secure cookies and IP detection work correctly
// (Hostinger's managed Node.js runs behind their own reverse proxy)
if (isProd) app.set('trust proxy', 1);

app.use(cors({
  origin: isProd ? false : 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  store: new FileStore({
    path: path.join(__dirname, 'sessions'),
    ttl: 7 * 24 * 60 * 60,   // 7 days in seconds
    retries: 1,
    logFn: () => {},          // silence verbose file-store logs
  }),
  secret: process.env.SESSION_SECRET || 'workdash_secret_change_me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProd,
    httpOnly: true,
    sameSite: isProd ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/overview', overviewRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/timings', timingsRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stream', streamRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'WorkDash API running', time: new Date().toISOString() });
});

// 404 handler for API routes only
app.all('/api/{*splat}', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found.' });
});

// --- Production: serve the React frontend build ---
if (isProd) {
  const fs = require('fs');
  // Frontend dist is committed as backend/public/ since Hostinger only deploys the backend dir
  const distPath = path.join(__dirname, 'public');
  console.log('📂 Frontend dist path:', distPath, '| exists:', fs.existsSync(distPath));

  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));

    // SPA fallback — any non-API route serves index.html so React Router handles it
    app.get('{*splat}', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    app.get('{*splat}', (req, res) => {
      res.status(503).json({
        success: false,
        message: 'Frontend not built. The public/ directory is missing.',
        distPath,
      });
    });
  }
}

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ success: false, message: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`🚀 WorkDash API running on http://localhost:${PORT}`);
  broadcaster.start();
});

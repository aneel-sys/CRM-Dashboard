const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const SETTINGS_FILE = path.join(__dirname, '../data/settings.json');
const UPLOADS_DIR = path.join(__dirname, '../public/uploads');

function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch {
    return { appName: 'CRM Dashboard', appSubtitle: 'Analytics Dashboard', logoFile: null, timeFormat: '24h' };
  }
}

function writeSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `logo${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, SVG)'));
    }
  },
});

function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  res.status(401).json({ success: false, message: 'Not authenticated.' });
}

function buildResponse(s) {
  return {
    success: true,
    appName: s.appName || 'CRM Dashboard',
    appSubtitle: s.appSubtitle || 'Analytics Dashboard',
    logoUrl: s.logoFile ? `/uploads/${s.logoFile}` : null,
    timeFormat: s.timeFormat || '24h',
  };
}

// GET /api/settings/public — no auth needed (login page uses this)
router.get('/public', (req, res) => {
  res.json(buildResponse(readSettings()));
});

// GET /api/settings — auth required (for settings page initial load)
router.get('/', requireAuth, (req, res) => {
  res.json(buildResponse(readSettings()));
});

// PUT /api/settings — update app name + subtitle
router.put('/', requireAuth, (req, res) => {
  const { appName, appSubtitle, timeFormat } = req.body;
  if (!appName?.trim()) {
    return res.status(400).json({ success: false, message: 'App name is required.' });
  }
  const s = readSettings();
  s.appName = appName.trim();
  s.appSubtitle = (appSubtitle || '').trim() || 'Analytics Dashboard';
  if (timeFormat === '12h' || timeFormat === '24h') s.timeFormat = timeFormat;
  writeSettings(s);
  res.json(buildResponse(s));
});

// POST /api/settings/logo — upload logo image
router.post('/logo', requireAuth, (req, res) => {
  upload.single('logo')(req, res, err => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

    const s = readSettings();
    // Remove old logo file if it has a different extension
    if (s.logoFile && s.logoFile !== req.file.filename) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, s.logoFile)); } catch {}
    }
    s.logoFile = req.file.filename;
    writeSettings(s);
    res.json({ success: true, logoUrl: `/uploads/${req.file.filename}` });
  });
});

// DELETE /api/settings/logo — remove logo, revert to default
router.delete('/logo', requireAuth, (req, res) => {
  const s = readSettings();
  if (s.logoFile) {
    try { fs.unlinkSync(path.join(UPLOADS_DIR, s.logoFile)); } catch {}
    s.logoFile = null;
    writeSettings(s);
  }
  res.json({ success: true });
});

module.exports = router;

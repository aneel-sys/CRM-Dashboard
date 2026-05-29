const express = require('express');
const router = express.Router();
require('dotenv').config();

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USER || 'admin';
  const validPass = process.env.ADMIN_PASS || 'workdash@2025';

  if (username === validUser && password === validPass) {
    req.session.user = { username, role: 'admin' };
    return res.json({ success: true, user: { username, role: 'admin' } });
  }
  return res.status(401).json({ success: false, message: 'Invalid username or password.' });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/me
router.get('/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ success: true, user: req.session.user });
  }
  return res.status(401).json({ success: false, message: 'Not authenticated.' });
});

module.exports = router;

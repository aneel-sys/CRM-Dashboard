const express = require('express');
const router  = express.Router();
const sse     = require('../lib/sse');
const { requireAuth } = require('../middleware/auth');

// GET /api/stream  — persistent SSE connection, one per browser tab
router.get('/', requireAuth, (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');   // disable Nginx buffering
  res.flushHeaders();

  sse.add(res);

  // Heartbeat keeps the connection alive through proxies
  const hb = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { /* closed */ }
  }, 25_000);

  req.on('close', () => {
    sse.remove(res);
    clearInterval(hb);
  });
});

module.exports = router;

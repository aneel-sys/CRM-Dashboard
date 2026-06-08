const clients = new Set();

module.exports = {
  add(res)    { clients.add(res); },
  remove(res) { clients.delete(res); },
  count()     { return clients.size; },

  broadcast(event, data) {
    if (!clients.size) return;
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try { res.write(msg); } catch { clients.delete(res); }
    }
  },
};

export function fmtTime(dt, timeFormat = '24h') {
  if (!dt) return '—';
  if (timeFormat === '12h') {
    return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return new Date(dt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

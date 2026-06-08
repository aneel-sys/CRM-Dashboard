export function fmtTime(dt, timeFormat = '24h') {
  if (!dt) return '—';
  if (timeFormat === '12h') {
    return new Date(dt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return new Date(dt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

// Format a "HH:mm" time string (not a Date) according to timeFormat
export function fmtTimeStr(t, timeFormat = '24h') {
  if (!t) return '—';
  if (timeFormat === '12h') {
    const [h, m] = t.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  return t.slice(0, 5);
}

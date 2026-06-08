import { useState, useEffect, useRef } from 'react';
import { MdNotifications, MdClose, MdWarning, MdError, MdInfo, MdRefresh, MdAccessTime, MdPeople, MdFolderOpen } from 'react-icons/md';
import api from '../api/axios';

const TYPE_CONFIG = {
  warning: { icon: MdWarning,  color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', dot: '#EF9F27' },
  error:   { icon: MdError,    color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', dot: '#E24B4A' },
  info:    { icon: MdInfo,     color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', dot: '#378ADD' },
};

const NOTIF_ICON = {
  'late-today':          MdAccessTime,
  'absent-today':        MdPeople,
  'low-attendance':      MdPeople,
  'upcoming-deadlines':  MdFolderOpen,
  'overdue-projects':    MdFolderOpen,
};

export default function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState(null);
  const panelRef = useRef(null);

  const fetchNotifications = () => {
    setLoading(true);
    api.get('/notifications')
      .then(res => {
        setNotifications(res.data.notifications || []);
        setTotal(res.data.total || 0);
        setLastFetched(new Date());
      })
      .catch(() => {
        setNotifications([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  };

  // Fetch on mount and every 60s
  useEffect(() => {
    fetchNotifications();
    const t = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open) fetchNotifications();
  };

  const hasAlerts = total > 0;

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        title="Notifications"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 40,
          height: 40,
          borderRadius: 10,
          border: 'none',
          background: open ? 'var(--bg)' : 'transparent',
          cursor: 'pointer',
          position: 'relative',
          color: open ? 'var(--primary)' : 'var(--text-secondary)',
          transition: 'background 0.15s, color 0.15s',
          padding: 0,
        }}
        onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--bg)'; }}
        onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent'; }}
      >
        <MdNotifications size={22} />
        {hasAlerts && (
          <span style={{
            position: 'absolute',
            top: 7,
            right: 7,
            minWidth: 16,
            height: 16,
            borderRadius: 99,
            background: 'var(--danger)',
            border: '2px solid var(--card)',
            fontSize: 9,
            fontWeight: 700,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 3px',
            lineHeight: 1,
          }}>
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 48,
          right: 0,
          width: 360,
          maxHeight: 480,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                Notifications
              </p>
              {lastFetched && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                  Updated {lastFetched.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={fetchNotifications}
                title="Refresh"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: 6, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)',
                }}
              >
                <MdRefresh size={17} style={{ ...(loading && { animation: 'spin 1s linear infinite' }) }} />
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 30, height: 30, borderRadius: 6, border: 'none',
                  background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)',
                }}
              >
                <MdClose size={17} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading && notifications.length === 0 ? (
              <div style={{ padding: 20 }}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="skeleton" style={{ height: 64, marginBottom: 10, borderRadius: 8 }} />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 10px', opacity: 0.3 }}>
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 4px' }}>All clear</p>
                <p style={{ fontSize: 12, margin: 0 }}>No alerts at the moment</p>
              </div>
            ) : (
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {notifications.map(n => {
                  const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
                  const ItemIcon = NOTIF_ICON[n.id] || MdInfo;
                  return (
                    <div key={n.id} style={{
                      display: 'flex',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 8,
                      background: cfg.bg,
                      border: `1px solid ${cfg.border}`,
                    }}>
                      {/* Icon */}
                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: cfg.border,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        <ItemIcon size={18} style={{ color: cfg.color }} />
                      </div>

                      {/* Content */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <p style={{ fontSize: 12, fontWeight: 700, color: cfg.color, margin: 0 }}>
                            {n.title}
                          </p>
                          <span style={{ fontSize: 10, color: cfg.color, opacity: 0.7, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {n.time}
                          </span>
                        </div>
                        <p style={{ fontSize: 11, color: '#374151', margin: '3px 0 0', lineHeight: 1.4 }}>
                          {n.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '10px 16px',
            borderTop: '1px solid var(--border)',
            textAlign: 'center',
          }}>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
              {hasAlerts
                ? `${total} active alert${total !== 1 ? 's' : ''} · auto-refreshes every 60s`
                : 'Monitoring: attendance, projects & deadlines'}
            </p>
          </div>
        </div>
      )}

      {/* Spin keyframe */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

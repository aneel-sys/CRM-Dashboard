import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MdMenu, MdDarkMode, MdLightMode, MdRefresh, MdSettings, MdSearch } from 'react-icons/md';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import NotificationPanel from './NotificationPanel';
import { useSSEConnected } from '../context/SSEContext';

const iconBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  borderRadius: 10,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'background 0.15s',
  padding: 0,
};

export default function Topbar({ title, sidebarWidth, onToggleSidebar, lastRefresh, onRefresh, onOpenSearch }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const navigate = useNavigate();
  const sseConnected = useSSEConnected();
  const [elapsed, setElapsed] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setElapsed(0);
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [lastRefresh]);

  return (
    <header style={{
      position: 'fixed',
      top: 0,
      left: sidebarWidth,
      right: 0,
      height: 60,
      zIndex: 30,
      background: 'var(--card)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      transition: 'left 0.2s ease',
    }}>

      {/* Left — hamburger + page title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          onClick={onToggleSidebar}
          style={{ ...iconBtn, color: 'var(--text-secondary)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <MdMenu size={24} />
        </button>
        <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
          {title}
        </h1>
      </div>

      {/* Right — controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>

        {/* Global search (Ctrl+K) */}
        <button
          onClick={onOpenSearch}
          title="Search people, projects, pages (Ctrl+K)"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 32,
            padding: '0 12px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-muted)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <MdSearch size={15} style={{ flexShrink: 0 }} />
          <span className="hidden md:inline">Search</span>
          <kbd style={{ fontSize: 9, border: '1px solid var(--border)', borderRadius: 4, padding: '1px 5px', background: 'var(--card)' }}>Ctrl K</kbd>
        </button>

        {/* SSE live indicator */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          height: 32,
          padding: '0 10px',
          borderRadius: 999,
          border: `1px solid ${sseConnected ? '#A7F3D0' : 'var(--border)'}`,
          background: sseConnected ? '#ECFDF5' : 'var(--bg)',
          color: sseConnected ? 'var(--primary-dark)' : 'var(--text-muted)',
          fontSize: 12,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          transition: 'all 0.3s',
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
            background: sseConnected ? 'var(--primary)' : '#9CA3AF',
            boxShadow: sseConnected ? '0 0 0 2px #6EE7B7' : 'none',
            animation: sseConnected ? 'ssePulse 2s infinite' : 'none',
          }} />
          {sseConnected ? 'Live' : 'Connecting…'}
        </div>

        {/* Manual refresh button */}
        <button
          onClick={onRefresh}
          title="Refresh all data now"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: 32,
            padding: '0 10px',
            borderRadius: 999,
            border: '1px solid var(--border)',
            background: 'var(--bg)',
            color: 'var(--text-muted)',
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
        >
          <MdRefresh size={14} style={{ color: 'var(--primary)', flexShrink: 0 }} />
          <span style={{ color: elapsed > 120 ? 'var(--warning)' : 'var(--text-muted)' }}>
            {elapsed}s ago
          </span>
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ ...iconBtn, color: dark ? '#EF9F27' : 'var(--text-secondary)' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          {dark ? <MdLightMode size={22} /> : <MdDarkMode size={22} />}
        </button>

        {/* Notifications — live panel */}
        <NotificationPanel />

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Avatar + menu */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(o => !o)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 34,
              padding: '0 8px',
              borderRadius: 8,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'var(--primary)',
              color: '#fff',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {user?.username?.[0]?.toUpperCase() || 'A'}
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              {user?.username || 'Admin'}
            </span>
          </button>

          {menuOpen && (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                onClick={() => setMenuOpen(false)}
              />
              <div style={{
                position: 'absolute',
                right: 0,
                top: 40,
                zIndex: 50,
                minWidth: 160,
                background: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                boxShadow: 'var(--card-shadow-md)',
                overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
                    {user?.username}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Administrator</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 14px',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--text)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <MdSettings size={15} />
                  Settings
                </button>
                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 14px',
                    fontSize: 13,
                    fontWeight: 500,
                    color: 'var(--danger)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

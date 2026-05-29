import { useState, useEffect } from 'react';
import { MdMenu, MdDarkMode, MdLightMode, MdRefresh, MdNotifications } from 'react-icons/md';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Topbar({ title, sidebarCollapsed, onToggleSidebar, lastRefresh, onRefresh }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [elapsed, setElapsed] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setElapsed(0);
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [lastRefresh]);

  const initials = user?.username?.[0]?.toUpperCase() || 'A';

  return (
    <header
      className="fixed top-0 right-0 z-30 flex items-center justify-between px-5 transition-all duration-200"
      style={{
        left: sidebarCollapsed ? 64 : 230,
        height: 56,
        background: 'var(--card)',
        borderBottom: '1px solid var(--border)',
        boxShadow: '0 1px 0 var(--border)',
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="btn btn-ghost w-8 h-8 p-0 rounded-lg flex items-center justify-center"
          style={{ height: 32, width: 32 }}
        >
          <MdMenu size={20} />
        </button>
        <div>
          <h1 className="font-bold text-[15px] leading-tight" style={{ color: 'var(--text)' }}>
            {title}
          </h1>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {/* Refresh pill */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            color: 'var(--text-secondary)',
          }}
        >
          <MdRefresh size={13} style={{ color: 'var(--primary)' }} />
          <span style={{ color: 'var(--text-muted)' }}>
            Auto-refresh: 60s
          </span>
          <span
            className="font-semibold"
            style={{ color: elapsed > 50 ? 'var(--warning)' : 'var(--primary)' }}
          >
            · {elapsed}s ago
          </span>
        </button>

        {/* Divider */}
        <div className="w-px h-5" style={{ background: 'var(--border)' }} />

        {/* Dark mode */}
        <button
          onClick={toggle}
          className="btn btn-ghost w-8 h-8 p-0 rounded-lg flex items-center justify-center"
          style={{ height: 32, width: 32 }}
          title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {dark
            ? <MdLightMode size={18} style={{ color: 'var(--warning)' }} />
            : <MdDarkMode size={18} style={{ color: 'var(--text-secondary)' }} />
          }
        </button>

        {/* Notifications */}
        <button
          className="btn btn-ghost relative w-8 h-8 p-0 rounded-lg flex items-center justify-center"
          style={{ height: 32, width: 32 }}
        >
          <MdNotifications size={19} style={{ color: 'var(--text-secondary)' }} />
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full border-2"
            style={{ background: 'var(--danger)', borderColor: 'var(--card)' }}
          />
        </button>

        {/* Divider */}
        <div className="w-px h-5" style={{ background: 'var(--border)' }} />

        {/* Avatar */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--bg)]"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: 'var(--primary)' }}
            >
              {initials}
            </div>
            <span className="text-xs font-medium hidden sm:block" style={{ color: 'var(--text)' }}>
              {user?.username || 'Admin'}
            </span>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute right-0 top-10 z-50 w-44 rounded-lg py-1 text-sm"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  boxShadow: 'var(--card-shadow-md)',
                }}
              >
                <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
                  <p className="font-semibold text-xs" style={{ color: 'var(--text)' }}>
                    {user?.username}
                  </p>
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Administrator</p>
                </div>
                <button
                  onClick={() => { setMenuOpen(false); logout(); }}
                  className="w-full text-left px-3 py-2 text-xs font-medium transition-colors hover:bg-red-50 text-red-500"
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

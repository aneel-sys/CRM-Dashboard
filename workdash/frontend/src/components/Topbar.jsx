import { useState, useEffect } from 'react';
import { MdMenu, MdDarkMode, MdLightMode, MdNotifications, MdSettings, MdRefresh } from 'react-icons/md';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

export default function Topbar({ title, sidebarCollapsed, onToggleSidebar, lastRefresh, onRefresh }) {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, [lastRefresh]);

  return (
    <header
      style={{ left: sidebarCollapsed ? 64 : 224 }}
      className="fixed top-0 right-0 h-14 bg-[var(--color-card)] border-b border-[var(--color-border)] flex items-center justify-between px-5 z-30 transition-all duration-200"
    >
      {/* Left */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <MdMenu size={22} />
        </button>
        <h1 className="font-bold text-[var(--color-text)] text-base">{title}</h1>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3">
        {/* Refresh pill */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded-full px-3 py-1 text-[var(--color-muted)] hover:text-[var(--color-primary)] transition-colors"
          style={{ '--color-primary': '#1D9E75' }}
        >
          <MdRefresh size={14} />
          <span>Auto-refresh: 60s · Updated {elapsed}s ago</span>
        </button>

        {/* Dark mode */}
        <button
          onClick={toggle}
          className="text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          {dark ? <MdLightMode size={20} /> : <MdDarkMode size={20} />}
        </button>

        {/* Notifications */}
        <button className="relative text-[var(--color-muted)] hover:text-[var(--color-text)]">
          <MdNotifications size={20} />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>

        {/* Avatar / logout */}
        <div className="relative group">
          <button className="w-8 h-8 rounded-full bg-[#1D9E75] text-white text-sm font-bold flex items-center justify-center">
            {user?.username?.[0]?.toUpperCase() || 'A'}
          </button>
          <div className="absolute right-0 top-10 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-lg p-2 hidden group-hover:block w-32 z-50">
            <button
              onClick={logout}
              className="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 rounded"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

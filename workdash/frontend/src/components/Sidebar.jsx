import { NavLink } from 'react-router-dom';
import {
  MdDashboard, MdAccessTime, MdPerson,
  MdFolderOpen, MdSchedule, MdPeople, MdNotifications,
} from 'react-icons/md';

const NAV = [
  {
    section: 'MAIN',
    items: [
      { to: '/', icon: MdDashboard, label: 'Overview' },
      { to: '/attendance', icon: MdAccessTime, label: 'Attendance' },
      { to: '/notifications', icon: MdNotifications, label: 'Alerts' },
    ],
  },
  {
    section: 'REPORTS',
    items: [
      { to: '/person', icon: MdPerson, label: 'Per Person' },
      { to: '/projects', icon: MdFolderOpen, label: 'Projects' },
      { to: '/timings', icon: MdSchedule, label: 'Timings' },
    ],
  },
  {
    section: 'TEAM',
    items: [
      { to: '/team', icon: MdPeople, label: 'All Employees' },
    ],
  },
];

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="7" fill="#1D9E75" />
      <rect x="6" y="18" width="4" height="6" rx="1" fill="white" opacity="0.9" />
      <rect x="12" y="13" width="4" height="11" rx="1" fill="white" />
      <rect x="18" y="8" width="4" height="16" rx="1" fill="white" opacity="0.7" />
    </svg>
  );
}

export default function Sidebar({ collapsed, width }) {
  return (
    <aside
      className="fixed top-0 left-0 h-screen flex flex-col z-40"
      style={{
        width,
        transition: 'width 0.2s ease',
        background: 'var(--sidebar)',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-4 py-5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}
      >
        <div className="shrink-0">
          <LogoMark />
        </div>
        {!collapsed && (
          <div>
            <div className="text-white font-bold text-[15px] leading-tight tracking-tight">
              WorkDash
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              Worksuite Analytics v1.0
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5">
        {NAV.map(group => (
          <div key={group.section} className="mb-1">
            {!collapsed && (
              <p
                className="text-[10px] font-bold tracking-widest px-2 py-2"
                style={{ color: 'rgba(255,255,255,0.25)' }}
              >
                {group.section}
              </p>
            )}
            {group.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                title={collapsed ? label : undefined}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderRadius: 8,
                  marginBottom: 2,
                  padding: collapsed ? '10px 0' : '9px 12px',
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  background: isActive ? 'rgba(29,158,117,0.14)' : 'transparent',
                  color: isActive ? '#1D9E75' : 'rgba(255,255,255,0.55)',
                  fontWeight: isActive ? 600 : 500,
                  borderLeft: !collapsed
                    ? `3px solid ${isActive ? '#1D9E75' : 'transparent'}`
                    : 'none',
                  textDecoration: 'none',
                  fontSize: 13,
                  transition: 'background 0.15s, color 0.15s',
                  cursor: 'pointer',
                })}
                onMouseEnter={e => {
                  if (!e.currentTarget.getAttribute('aria-current'))
                    e.currentTarget.style.background = 'rgba(255,255,255,0.07)';
                }}
                onMouseLeave={e => {
                  if (!e.currentTarget.getAttribute('aria-current'))
                    e.currentTarget.style.background = 'transparent';
                }}
              >
                <Icon size={17} style={{ flexShrink: 0 }} />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-3"
        style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
      >
        {collapsed ? (
          <div style={{ display: 'flex', justifyContent: 'center', opacity: 0.3 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        ) : (
          <div>
            <p className="text-[11px] font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Office hours: 09:00 – 18:00
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>
              Admin Panel · Read-only DB
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

import { NavLink } from 'react-router-dom';
import { MdDashboard, MdAccessTime, MdPerson, MdFolderOpen, MdSchedule, MdPeople } from 'react-icons/md';

const NAV = [
  { section: 'MAIN', items: [
    { to: '/', icon: MdDashboard, label: 'Overview' },
    { to: '/attendance', icon: MdAccessTime, label: 'Attendance' },
  ]},
  { section: 'REPORTS', items: [
    { to: '/person', icon: MdPerson, label: 'Per Person' },
    { to: '/projects', icon: MdFolderOpen, label: 'Projects' },
    { to: '/timings', icon: MdSchedule, label: 'Timings' },
  ]},
  { section: 'TEAM', items: [
    { to: '/team', icon: MdPeople, label: 'All Employees' },
  ]},
];

export default function Sidebar({ collapsed }) {
  return (
    <aside
      style={{ backgroundColor: '#0f1923', width: collapsed ? 64 : 224 }}
      className="fixed top-0 left-0 h-screen flex flex-col transition-all duration-200 z-40"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
        <span className="text-2xl">📊</span>
        {!collapsed && (
          <div>
            <div className="text-white font-bold text-base leading-tight">WorkDash</div>
            <div className="text-white/40 text-xs">Worksuite Analytics v1.0</div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2">
        {NAV.map(group => (
          <div key={group.section} className="mb-4">
            {!collapsed && (
              <div className="text-white/30 text-xs font-semibold tracking-widest px-3 mb-1">
                {group.section}
              </div>
            )}
            {group.items.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-colors
                   ${isActive
                     ? 'border-l-[3px] border-[#1D9E75] bg-[#1D9E75]/10 text-[#1D9E75] font-medium pl-[9px]'
                     : 'text-white/60 hover:text-white hover:bg-white/5 border-l-[3px] border-transparent pl-[9px]'
                   }`
                }
              >
                <Icon size={18} className="shrink-0" />
                {!collapsed && <span>{label}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="text-white/30 text-xs">
          {!collapsed ? (
            <>
              <div>Office: 09:00 AM</div>
              <div className="mt-0.5 text-white/20">Admin Panel</div>
            </>
          ) : (
            <div className="text-center">🕘</div>
          )}
        </div>
      </div>
    </aside>
  );
}

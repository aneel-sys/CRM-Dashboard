import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

const PAGE_TITLES = {
  '/': 'Overview Dashboard',
  '/attendance': 'Attendance & Late Tracking',
  '/person': 'Per Person Monthly Progress',
  '/projects': 'Projects Overview',
  '/timings': 'Timings / Timesheets',
  '/team': 'All Employees',
};

const REFRESH_INTERVAL = 60 * 1000;

export default function Layout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [refreshKey, setRefreshKey] = useState(0);

  const doRefresh = useCallback(() => {
    setLastRefresh(Date.now());
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    const t = setInterval(doRefresh, REFRESH_INTERVAL);
    return () => clearInterval(t);
  }, [doRefresh]);

  const title = PAGE_TITLES[location.pathname] || 'WorkDash';

  return (
    <div className="flex min-h-screen bg-[var(--color-bg)]">
      <Sidebar collapsed={collapsed} />
      <div
        className="flex-1 flex flex-col transition-all duration-200"
        style={{ marginLeft: collapsed ? 64 : 224 }}
      >
        <Topbar
          title={title}
          sidebarCollapsed={collapsed}
          onToggleSidebar={() => setCollapsed(c => !c)}
          lastRefresh={lastRefresh}
          onRefresh={doRefresh}
        />
        <main className="flex-1 pt-14 p-6 overflow-auto">
          <Outlet context={{ refreshKey }} />
        </main>
      </div>
    </div>
  );
}

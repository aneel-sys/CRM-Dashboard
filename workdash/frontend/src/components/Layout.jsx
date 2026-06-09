import { useState, useEffect, useCallback } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import { useSettings } from '../context/SettingsContext';

const PAGE_TITLES = {
  '/':               'Overview Dashboard',
  '/attendance':     'Attendance & Late Tracking',
  '/person':         'Per Person Monthly Progress',
  '/projects':       'Projects Overview',
  '/timings':        'Timings / Timesheets',
  '/team':           'All Employees',
  '/reports':        'Reports & Exports',
  '/notifications':  'Alerts & Notifications',
  '/settings':       'Settings',
};

const SIDEBAR_W = 230;
const SIDEBAR_C = 64;
const TOPBAR_H  = 60;

export default function Layout() {
  const location = useLocation();
  const { appName } = useSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(Date.now());
  const [refreshKey, setRefreshKey] = useState(0);

  const doRefresh = useCallback(() => {
    setLastRefresh(Date.now());
    setRefreshKey(k => k + 1);
  }, []);

  const sw = collapsed ? SIDEBAR_C : SIDEBAR_W;
  const title = PAGE_TITLES[location.pathname] || appName;

  useEffect(() => {
    document.title = title !== appName ? `${title} | ${appName}` : appName;
  }, [title, appName]);

  return (
    /* Outer shell — full viewport, background from CSS var */
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex' }}>

      {/* Fixed sidebar */}
      <Sidebar collapsed={collapsed} width={sw} />

      {/* Everything to the right of the sidebar */}
      <div style={{
        marginLeft: sw,
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        transition: 'margin-left 0.2s ease',
      }}>
        <Topbar
          title={title}
          sidebarWidth={sw}
          onToggleSidebar={() => setCollapsed(c => !c)}
          lastRefresh={lastRefresh}
          onRefresh={doRefresh}
        />

        {/* Scrollable content area, below topbar */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          paddingTop: TOPBAR_H,
        }}>
          <div style={{ padding: '24px', width: '100%' }}>
            <Outlet context={{ refreshKey }} />
          </div>
        </main>
      </div>
    </div>
  );
}

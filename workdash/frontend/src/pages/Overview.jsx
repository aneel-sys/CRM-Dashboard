import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area,
} from 'recharts';
import {
  MdPeople, MdAccessTime, MdPersonOff, MdAvTimer, MdBeachAccess, MdWork, MdSignalWifi4Bar,
  MdTrendingUp, MdFolderOpen, MdEmojiEvents,
} from 'react-icons/md';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import api from '../api/axios';
import { fmtTime } from '../utils/time';
import { useSettings } from '../context/SettingsContext';
import { useSSE } from '../context/SSEContext';
import { useAuth } from '../context/AuthContext';

const DONUT_COLORS  = ['#1D9E75', '#378ADD', '#E24B4A', '#EF9F27'];
const HEALTH_COLORS = { onTrack: '#1D9E75', atRisk: '#EF9F27', overdue: '#E24B4A' };

// ─── helpers ──────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Good night';
}

function getFormattedDate() {
  const now = new Date();
  const weekday = now.toLocaleDateString('en-GB', { weekday: 'long' });
  const day     = String(now.getDate()).padStart(2, '0');
  const month   = now.toLocaleDateString('en-GB', { month: 'long' });
  return `${weekday} ${day} ${month}`;
}

// ─── Sub-components ────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="section-title">{title}</p>
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function DeptRow({ dept }) {
  const pct   = dept.total > 0 ? Math.round((dept.present / dept.total) * 100) : 0;
  const color = pct >= 80 ? 'var(--primary)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  return (
    <tr>
      <td style={{ color: 'var(--text)', fontSize: 13, fontWeight: 500, padding: '8px 0' }}>
        {dept.department}
      </td>
      <td style={{ textAlign: 'center' }}>
        <span className="font-bold text-sm" style={{ color: 'var(--primary)' }}>{dept.present}</span>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span className="text-sm" style={{ color: dept.late > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{dept.late}</span>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span className="text-sm" style={{ color: dept.absent > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{dept.absent}</span>
      </td>
      <td style={{ width: 100 }}>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 9999, background: color }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{pct}%</span>
        </div>
      </td>
    </tr>
  );
}

const RANK_COLORS = ['#EF9F27', '#9CA3AF', '#CD7C3B', '#6B7280', '#6B7280'];
const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th'];

function RankBadge({ rank }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: RANK_COLORS[rank] + '22',
      border: `2px solid ${RANK_COLORS[rank]}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: RANK_COLORS[rank] }}>
        {RANK_LABELS[rank]}
      </span>
    </div>
  );
}

// ─── Tooltips ──────────────────────────────────────────────────────────────

const DailyHoursTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="card px-3 py-2 text-xs" style={{ boxShadow: 'var(--card-shadow-md)' }}>
      <p className="font-semibold" style={{ color: 'var(--text)', marginBottom: 2 }}>{d.name}</p>
      <p style={{ color: 'var(--primary)', margin: 0 }}>{d.hours}h logged</p>
      {d.employees > 0 && <p style={{ color: 'var(--text-muted)', margin: 0 }}>{d.employees} employee{d.employees !== 1 ? 's' : ''}</p>}
    </div>
  );
};

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs" style={{ boxShadow: 'var(--card-shadow-md)', minWidth: 120 }}>
      <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, margin: 0 }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

const DonutLegend = ({ payload }) => (
  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
    {payload.map((entry, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, display: 'inline-block' }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {entry.value} <strong style={{ color: 'var(--text)' }}>{entry.payload.value}</strong>
        </span>
      </div>
    ))}
  </div>
);

// ─── Main page ─────────────────────────────────────────────────────────────

export default function Overview() {
  const { refreshKey }  = useOutletContext();
  const navigate        = useNavigate();
  const toast           = useToast();
  const { timeFormat }  = useSettings();
  const { user }        = useAuth();
  const fmt             = dt => fmtTime(dt, timeFormat);

  const [data, setData]                     = useState(null);
  const [loading, setLoading]               = useState(true);
  const [trend30, setTrend30]               = useState([]);
  const [trendLoading, setTrendLoading]     = useState(true);
  const [projectHealth, setProjectHealth]   = useState(null);
  const [healthLoading, setHealthLoading]   = useState(true);
  const [performers, setPerformers]         = useState([]);
  const [perfLoading, setPerfLoading]       = useState(true);

  const sseOverview = useSSE('overview');

  // Initial load + manual refresh
  useEffect(() => {
    setLoading(true);
    api.get('/overview/today')
      .then(res => { setData(res.data); setLoading(false); })
      .catch(err => { toast(err.response?.data?.message || 'Failed to load overview'); setLoading(false); });
  }, [refreshKey]);

  // SSE push
  useEffect(() => {
    if (!sseOverview?.data) return;
    const d = sseOverview.data;
    setData(prev => prev ? {
      ...prev,
      stats:               { ...prev.stats, ...d.stats },
      lateArrivals:        d.lateArrivals        ?? prev.lateArrivals,
      attendanceBreakdown: d.attendanceBreakdown ?? prev.attendanceBreakdown,
      currentlyWorking:    d.currentlyWorking    ?? prev.currentlyWorking,
    } : null);
  }, [sseOverview]);

  // 30-day trend
  useEffect(() => {
    setTrendLoading(true);
    api.get('/attendance/trend?days=30')
      .then(res => setTrend30(res.data.trend || []))
      .catch(() => {})
      .finally(() => setTrendLoading(false));
  }, [refreshKey]);

  // Project health
  useEffect(() => {
    setHealthLoading(true);
    api.get('/overview/project-health')
      .then(res => setProjectHealth(res.data))
      .catch(() => setProjectHealth(null))
      .finally(() => setHealthLoading(false));
  }, [refreshKey]);

  // Top performers
  useEffect(() => {
    setPerfLoading(true);
    api.get('/overview/top-performers')
      .then(res => setPerformers(res.data.performers || []))
      .catch(() => setPerformers([]))
      .finally(() => setPerfLoading(false));
  }, [refreshKey]);

  const stats            = data?.stats || {};
  const currentlyWorking = data?.currentlyWorking || { count: 0, list: [] };
  const deptBreakdown    = data?.deptBreakdown || [];

  const dailyData = (data?.dailyHours || []).map(d => {
    const dt = new Date(d.date + 'T00:00:00');
    return {
      name:      dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      hours:     parseFloat(d.hours) || 0,
      employees: d.employees || 0,
    };
  });

  const donutData = [
    { name: 'Present',  value: data?.attendanceBreakdown?.present  || 0 },
    { name: 'On Leave', value: data?.attendanceBreakdown?.onLeave  || 0 },
    { name: 'Absent',   value: data?.attendanceBreakdown?.absent   || 0 },
  ].filter(d => d.value > 0);

  const healthDonutData = projectHealth ? [
    { name: 'On Track', value: projectHealth.onTrack },
    { name: 'At Risk',  value: projectHealth.atRisk  },
    { name: 'Overdue',  value: projectHealth.overdue },
  ].filter(d => d.value > 0) : [];

  const HEALTH_PIE_COLORS = ['#1D9E75', '#EF9F27', '#E24B4A'];

  return (
    <div className="space-y-5 fade-up">

      {/* ── Greeting header ───────────────────────────────────────────── */}
      <div style={{
        background: 'var(--card)',
        borderRadius: 14,
        borderLeft: '4px solid #1D9E75',
        padding: '18px 24px',
        boxShadow: 'var(--card-shadow)',
      }}>
        <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0, lineHeight: 1.2 }}>
          {getGreeting()}{user?.username ? `, ${user.username}` : ''}
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0' }}>
          {getFormattedDate()}
        </p>
      </div>

      {/* ── KPI stat cards (5) ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          { title: 'Present Today',    icon: MdPeople,      color: '#1D9E75', value: stats.present ?? '—',                              sub: stats.total !== undefined ? `of ${stats.total} employees` : '—', to: '/attendance' },
          { title: 'Late Today',       icon: MdAccessTime,  color: '#EF9F27', value: stats.late    ?? '—',                              sub: 'arrived after office start',                                       to: '/attendance?status=Late' },
          { title: 'Absent Today',     icon: MdPersonOff,   color: '#E24B4A', value: stats.absent  ?? '—',                              sub: 'no clock-in recorded',                                             to: '/attendance?status=Absent' },
          { title: 'On Leave Today',   icon: MdBeachAccess, color: '#8B5CF6', value: stats.onLeave ?? '—',                              sub: 'approved leave',                                                   to: '/attendance' },
          { title: 'Hours This Month', icon: MdAvTimer,     color: '#378ADD', value: stats.monthHours != null ? `${stats.monthHours}h` : '—', sub: 'across all projects',                                      to: '/timings' },
        ].map(card => (
          <div key={card.title} onClick={() => navigate(card.to)} style={{ cursor: 'pointer' }}>
            <StatCard title={card.title} icon={card.icon} color={card.color} value={card.value} sub={card.sub} loading={loading} />
          </div>
        ))}
      </div>

      {/* ── NEW ROW: 30-day Attendance Trend + Project Health ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* 30-day Attendance Trend — area chart */}
        <div className="lg:col-span-3">
          <SectionCard
            title="30-Day Attendance Trend"
            subtitle="On Time · Late · Absent per day"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <MdTrendingUp size={14} style={{ color: 'var(--primary)' }} />
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last 30 days</span>
              </div>
            }
          >
            {trendLoading ? (
              <div className="skeleton h-40 rounded" />
            ) : trend30.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No attendance trend data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={155}>
                <AreaChart data={trend30} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gradOnTime" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#1D9E75" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#1D9E75" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="gradLate" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#EF9F27" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#EF9F27" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="gradAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#E24B4A" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#E24B4A" stopOpacity={0}    />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--border)' }} />
                  <Area type="monotone" dataKey="onTime" name="On Time" stroke="#1D9E75" strokeWidth={2} fill="url(#gradOnTime)" dot={false} />
                  <Area type="monotone" dataKey="late"   name="Late"    stroke="#EF9F27" strokeWidth={2} fill="url(#gradLate)"   dot={false} />
                  <Area type="monotone" dataKey="absent" name="Absent"  stroke="#E24B4A" strokeWidth={2} fill="url(#gradAbsent)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        {/* Project Health Donut */}
        <div className="lg:col-span-2">
          <SectionCard
            title="Project Health"
            subtitle="Active projects by deadline status"
            action={
              <button onClick={() => navigate('/projects')} className="btn btn-ghost text-xs"
                style={{ color: 'var(--primary)', height: 28, padding: '0 10px' }}>
                View All →
              </button>
            }
          >
            {healthLoading ? (
              <div className="skeleton h-40 rounded" />
            ) : !projectHealth || projectHealth.total === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <MdFolderOpen size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
                <p className="text-sm">No active projects</p>
              </div>
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={110}>
                  <PieChart>
                    <Pie data={healthDonutData} cx="50%" cy="50%" innerRadius={30} outerRadius={46}
                      dataKey="value" paddingAngle={3}>
                      {healthDonutData.map((_, i) => <Cell key={i} fill={HEALTH_PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
                  {[
                    { label: 'On Track', value: projectHealth.onTrack, color: '#1D9E75' },
                    { label: 'At Risk',  value: projectHealth.atRisk,  color: '#EF9F27' },
                    { label: 'Overdue',  value: projectHealth.overdue, color: '#E24B4A' },
                  ].map(item => (
                    <div key={item.label} style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: 18, fontWeight: 800, color: item.color, margin: 0 }}>{item.value}</p>
                      <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Mid row: Late Arrivals + Daily Hours + Today's Attendance ──── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Late Arrivals */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Late Arrivals Today"
            subtitle={loading ? '' : `${stats.late || 0} employees`}
            action={
              !loading && (stats.late || 0) > 0 ? (
                <button onClick={() => navigate('/attendance?status=Late')} className="btn btn-ghost text-xs"
                  style={{ color: 'var(--primary)', height: 28, padding: '0 10px' }}>
                  View All →
                </button>
              ) : null
            }
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <div className="skeleton h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3 w-32 rounded" />
                      <div className="skeleton h-2.5 w-20 rounded" />
                    </div>
                    <div className="skeleton h-6 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            ) : !data?.lateArrivals?.length ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px' }}>
                  <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
                </svg>
                <p className="text-sm font-medium">All employees arrived on time</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Employee</th><th>Role</th><th>Clock In</th><th>Delay</th></tr>
                </thead>
                <tbody>
                  {data.lateArrivals.map(row => (
                    <tr key={row.id} onClick={() => navigate(`/person?id=${row.id}`)} style={{ cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <td>
                        <div>
                          <p className="font-semibold text-[13px]" style={{ color: 'var(--text)' }}>{row.name}</p>
                          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{row.department}</p>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{row.designation || '—'}</td>
                      <td className="font-semibold" style={{ color: 'var(--danger)' }}>{fmt(row.clock_in_time)}</td>
                      <td>
                        {row.delay_minutes > 0
                          ? <span className="pill pill-red">+{row.delay_minutes}m</span>
                          : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

        {/* Daily Hours + Today's Attendance donut */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <SectionCard
            title="Daily Hours"
            subtitle="Last 14 days"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: sseOverview ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                <MdSignalWifi4Bar size={13} style={{ opacity: sseOverview ? 1 : 0.4 }} />
                {sseOverview ? 'Live' : 'Connecting…'}
              </div>
            }
          >
            {loading ? (
              <div className="skeleton h-28 rounded" />
            ) : dailyData.length === 0 ? (
              <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No hours logged yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={dailyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<DailyHoursTooltip />} cursor={{ fill: 'var(--bg)' }} />
                  <Bar dataKey="hours" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title="Today's Attendance">
            {loading ? (
              <div className="skeleton h-28 rounded" />
            ) : donutData.length === 0 ? (
              <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No attendance data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="45%" innerRadius={32} outerRadius={50} dataKey="value" paddingAngle={3}>
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend content={<DonutLegend />} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Top Performers + Absence Alerts + Active Projects ─────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

        {/* Top Performers Leaderboard (replaces basic Top Workers) */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <MdEmojiEvents size={16} style={{ color: '#EF9F27' }} />
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)', margin: 0 }}>
              Top Performers · This Month
            </p>
          </div>
          {perfLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="skeleton h-7 w-7 rounded-full" />
                  <div className="skeleton h-3 flex-1 rounded" />
                  <div className="skeleton h-3 w-10 rounded" />
                </div>
              ))}
            </div>
          ) : performers.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No timesheet data yet</p>
          ) : (
            <div className="space-y-2.5">
              {performers.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/person?id=${p.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 8, padding: '5px 6px', margin: '-5px -6px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <RankBadge rank={i} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', margin: 0 }}>
                      {p.total_hours.toFixed(1)}h
                    </p>
                    <p style={{ fontSize: 10, color: p.attendance_pct >= 80 ? '#1D9E75' : p.attendance_pct >= 60 ? '#EF9F27' : '#E24B4A', margin: 0, fontWeight: 600 }}>
                      {p.attendance_pct}% att.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Absence Alerts */}
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Absence Alerts</p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--danger-light)', border: '1px solid #FECACA' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--danger)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>{stats.absent || 0} absent today</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--warning-light)', border: '1px solid #FDE68A' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--warning)' }} />
                <span className="text-sm font-semibold" style={{ color: '#D97706' }}>{stats.late || 0} late arrivals</span>
              </div>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--primary-light)', border: '1px solid #A7F3D0' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--primary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--primary-dark)' }}>
                  {(stats.present || 0) - (stats.late || 0)} on time today
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Active Projects */}
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Active Projects</p>
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton h-10 w-16 rounded" />
              <div className="skeleton h-2 rounded-full" />
            </div>
          ) : (
            <>
              <p className="text-4xl font-bold mb-4" style={{ color: 'var(--text)' }}>{stats.activeProjects ?? '—'}</p>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full" style={{
                  width: projectHealth?.total > 0 ? `${Math.round((projectHealth.onTrack / projectHealth.total) * 100)}%` : '70%',
                  background: 'var(--primary)',
                }} />
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                {projectHealth ? `${projectHealth.onTrack} on track` : 'in progress'}
              </p>
            </>
          )}
        </div>
      </div>

      {/* ── Currently Working + Department Breakdown ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        <div className="lg:col-span-2">
          <SectionCard
            title="Currently Working"
            subtitle="Clocked in · not yet clocked out"
            action={
              <div style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                <MdWork size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                Live
              </div>
            }
          >
            {loading ? (
              <div className="space-y-3">
                <div className="skeleton h-12 w-20 rounded" />
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-8 rounded-lg" />)}
              </div>
            ) : (
              <>
                <p className="text-5xl font-black mb-4" style={{ color: '#1D9E75' }}>
                  {currentlyWorking.count}
                </p>
                <div className="space-y-1.5">
                  {currentlyWorking.list.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active sessions right now</p>
                  ) : (
                    currentlyWorking.list.map(emp => (
                      <div key={emp.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                        <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: '#1D9E75' }} />
                        <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{emp.name}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>since {fmt(emp.clock_in_time)}</span>
                      </div>
                    ))
                  )}
                  {currentlyWorking.count > currentlyWorking.list.length && (
                    <p className="text-xs text-center pt-1" style={{ color: 'var(--text-muted)' }}>
                      +{currentlyWorking.count - currentlyWorking.list.length} more
                    </p>
                  )}
                </div>
              </>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-3">
          <SectionCard title="Department Breakdown" subtitle="Today's attendance by team">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-8 rounded" />)}
              </div>
            ) : deptBreakdown.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No department data</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Department', 'Present', 'Late', 'Absent', 'Rate'].map(h => (
                      <th key={h} style={{
                        fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        textAlign: h === 'Department' ? 'left' : 'center',
                        paddingBottom: 8,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deptBreakdown.map(dept => <DeptRow key={dept.department} dept={dept} />)}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

      </div>
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  MdPeople, MdAccessTime, MdPersonOff, MdAvTimer, MdBeachAccess, MdWork, MdSignalWifi4Bar,
} from 'react-icons/md';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import api from '../api/axios';
import { fmtTime } from '../utils/time';
import { useSettings } from '../context/SettingsContext';

const DONUT_COLORS = ['#1D9E75', '#378ADD', '#E24B4A', '#EF9F27'];

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

function DeptRow({ dept, officeStart }) {
  const pct = dept.total > 0 ? Math.round((dept.present / dept.total) * 100) : 0;
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
        <span className="text-sm" style={{ color: dept.late > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>
          {dept.late}
        </span>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span className="text-sm" style={{ color: dept.absent > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
          {dept.absent}
        </span>
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

export default function Overview() {
  const { refreshKey } = useOutletContext();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const esRef = useRef(null);

  const applyData = (payload) => {
    setData(payload);
    setLoading(false);
  };

  useEffect(() => {
    // Initial HTTP fetch so the page loads immediately
    setLoading(true);
    api.get('/overview/today')
      .then(res => applyData(res.data))
      .catch(err => {
        toast(err.response?.data?.message || 'Failed to load overview');
        setLoading(false);
      });

    // SSE stream for real-time push updates
    const baseUrl = api.defaults.baseURL?.replace(/\/$/, '') || '';
    const es = new EventSource(`${baseUrl}/overview/stream`, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => setLive(true);
    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.success) applyData(payload);
      } catch { /* ignore malformed */ }
    };
    es.onerror = () => setLive(false);

    return () => {
      es.close();
      setLive(false);
    };
  }, [refreshKey]);

  const { timeFormat } = useSettings();
  const fmt = dt => fmtTime(dt, timeFormat);
  const stats = data?.stats || {};

  const dailyData = (data?.dailyHours || []).map(d => {
    const dt = new Date(d.date + 'T00:00:00');
    return {
      name: dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      hours: parseFloat(d.hours) || 0,
      employees: d.employees || 0,
    };
  });

  const donutData = [
    { name: 'Present',  value: data?.attendanceBreakdown?.present  || 0 },
    { name: 'On Leave', value: data?.attendanceBreakdown?.onLeave  || 0 },
    { name: 'Absent',   value: data?.attendanceBreakdown?.absent   || 0 },
  ].filter(d => d.value > 0);

  const currentlyWorking = data?.currentlyWorking || { count: 0, list: [] };
  const deptBreakdown = data?.deptBreakdown || [];

  const customTooltip = ({ active, payload }) => {
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

  const donutLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, value }) => {
    const RADIAN = Math.PI / 180;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return value > 0 ? (
      <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>{value}</text>
    ) : null;
  };

  const donutLegend = ({ payload }) => (
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

  return (
    <div className="space-y-5 fade-up">

      {/* Stat Cards — 5 cards */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
        {[
          {
            title: 'Present Today', icon: MdPeople, color: '#1D9E75',
            value: stats.present ?? '—',
            sub: stats.total !== undefined ? `of ${stats.total} employees` : '—',
            to: '/attendance',
          },
          {
            title: 'Late Today', icon: MdAccessTime, color: '#EF9F27',
            value: stats.late ?? '—',
            sub: 'arrived after office start',
            to: '/attendance?status=Late',
          },
          {
            title: 'Absent Today', icon: MdPersonOff, color: '#E24B4A',
            value: stats.absent ?? '—',
            sub: 'no clock-in recorded',
            to: '/attendance?status=Absent',
          },
          {
            title: 'On Leave Today', icon: MdBeachAccess, color: '#8B5CF6',
            value: stats.onLeave ?? '—',
            sub: 'approved leave',
            to: '/attendance',
          },
          {
            title: 'Hours This Month', icon: MdAvTimer, color: '#378ADD',
            value: stats.monthHours != null ? `${stats.monthHours}h` : '—',
            sub: 'across all projects',
            to: '/timings',
          },
        ].map(card => (
          <div key={card.title} onClick={() => navigate(card.to)} style={{ cursor: 'pointer' }} title={`Go to ${card.title}`}>
            <StatCard title={card.title} icon={card.icon} color={card.color} value={card.value} sub={card.sub} loading={loading} />
          </div>
        ))}
      </div>

      {/* Mid row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Late Arrivals */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Late Arrivals Today"
            subtitle={loading ? '' : `${stats.late || 0} employees`}
            action={
              !loading && (stats.late || 0) > 0 ? (
                <button
                  onClick={() => navigate('/attendance?status=Late')}
                  className="btn btn-ghost text-xs"
                  style={{ color: 'var(--primary)', height: 28, padding: '0 10px' }}
                >
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
                  <tr>
                    <th>Employee</th><th>Role</th><th>Clock In</th><th>Delay</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lateArrivals.map(row => (
                    <tr
                      key={row.id}
                      onClick={() => navigate(`/person?id=${row.id}`)}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
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

        {/* Charts column */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <SectionCard
            title="Daily Hours"
            subtitle="Last 14 days"
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: live ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600 }}>
                <MdSignalWifi4Bar size={13} style={{ opacity: live ? 1 : 0.4 }} />
                {live ? 'Live' : 'Connecting…'}
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
                  <Tooltip content={customTooltip} cursor={{ fill: 'var(--bg)' }} />
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
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="45%"
                    innerRadius={32}
                    outerRadius={50}
                    dataKey="value"
                    paddingAngle={3}
                    labelLine={false}
                    label={donutLabel}
                  >
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend content={donutLegend} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Bottom row — Active Projects / Top Workers / Absence Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div className="h-full rounded-full" style={{ width: '70%', background: 'var(--primary)' }} />
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>in progress</p>
            </>
          )}
        </div>

        {/* Top Workers */}
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Top Workers This Month</p>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="skeleton h-3 w-3 rounded" />
                  <div className="skeleton h-3 flex-1 rounded" />
                  <div className="skeleton h-3 w-10 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(data?.topWorkers || []).slice(0, 3).map((w, i) => (
                <div
                  key={w.id}
                  className="flex items-center gap-3"
                  onClick={() => navigate(`/person?id=${w.id}`)}
                  style={{ cursor: 'pointer', borderRadius: 8, padding: '4px 6px', margin: '-4px -6px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: i === 0 ? '#EF9F27' : i === 1 ? '#9CA3AF' : '#D97706' }}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{w.name}</span>
                  <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>
                    {parseFloat(w.total_hours || 0).toFixed(1)}h
                  </span>
                </div>
              ))}
              {!data?.topWorkers?.length && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No data yet</p>}
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
      </div>

      {/* New row — Currently Working + Department Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Currently Working widget */}
        <div className="lg:col-span-2">
          <SectionCard
            title="Currently Working"
            subtitle="Clocked in · not yet clocked out"
            action={
              <div style={{
                background: 'var(--primary-light)',
                color: 'var(--primary-dark)',
                borderRadius: 999,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 700,
              }}>
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
                      <div
                        key={emp.id}
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                        style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0 animate-pulse" style={{ background: '#1D9E75' }} />
                        <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>
                          {emp.name}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          since {fmt(emp.clock_in_time)}
                        </span>
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

        {/* Department Breakdown */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Department Breakdown"
            subtitle="Today's attendance by team"
          >
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
                  {deptBreakdown.map(dept => (
                    <DeptRow key={dept.department} dept={dept} />
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>

      </div>
    </div>
  );
}

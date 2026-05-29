import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { MdPeople, MdAccessTime, MdPersonOff, MdAvTimer } from 'react-icons/md';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const DONUT_COLORS = ['#1D9E75', '#378ADD', '#E24B4A', '#EF9F27'];

function fmt(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
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

export default function Overview() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/overview/today')
      .then(res => setData(res.data))
      .catch(err => toast(err.response?.data?.message || 'Failed to load overview'))
      .finally(() => setLoading(false));
  }, [refreshKey]);

  const stats = data?.stats || {};

  const weeklyData = (data?.weeklyHours || []).map(w => ({
    name: `W${w.week}`,
    hours: parseFloat(w.hours) || 0,
  }));

  const donutData = [
    { name: 'Present', value: data?.attendanceBreakdown?.present || 0 },
    { name: 'On Leave', value: data?.attendanceBreakdown?.onLeave || 0 },
    { name: 'Absent',   value: data?.attendanceBreakdown?.absent  || 0 },
  ].filter(d => d.value > 0);

  const customTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="card px-3 py-2 text-xs" style={{ boxShadow: 'var(--card-shadow-md)' }}>
        <p className="font-semibold" style={{ color: 'var(--text)' }}>{payload[0].payload.name}</p>
        <p style={{ color: 'var(--primary)' }}>{payload[0].value}h</p>
      </div>
    );
  };

  return (
    <div className="space-y-5 fade-up">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Present Today" icon={MdPeople} color="#1D9E75"
          value={stats.present ?? '—'}
          sub={stats.total !== undefined ? `of ${stats.total} employees` : '—'}
          loading={loading}
        />
        <StatCard
          title="Late Today" icon={MdAccessTime} color="#EF9F27"
          value={stats.late ?? '—'}
          sub="arrived after 09:00 AM"
          loading={loading}
        />
        <StatCard
          title="Absent Today" icon={MdPersonOff} color="#E24B4A"
          value={stats.absent ?? '—'}
          sub="no clock-in recorded"
          loading={loading}
        />
        <StatCard
          title="Hours This Month" icon={MdAvTimer} color="#378ADD"
          value={stats.monthHours != null ? `${stats.monthHours}h` : '—'}
          sub="across all projects"
          loading={loading}
        />
      </div>

      {/* Mid row */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Late Arrivals */}
        <div className="lg:col-span-3">
          <SectionCard
            title="Late Arrivals Today"
            subtitle={loading ? '' : `${data?.lateArrivals?.length || 0} employees`}
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
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
                <p className="text-sm font-medium">All employees arrived on time</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role</th>
                    <th>Clock In</th>
                    <th>Delay</th>
                  </tr>
                </thead>
                <tbody>
                  {data.lateArrivals.map(row => (
                    <tr key={row.id}>
                      <td>
                        <div>
                          <p className="font-semibold text-[13px]" style={{ color: 'var(--text)' }}>{row.name}</p>
                          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{row.department}</p>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        {row.designation || '—'}
                      </td>
                      <td className="font-semibold" style={{ color: 'var(--danger)' }}>
                        {fmt(row.clock_in_time)}
                      </td>
                      <td>
                        <span className="pill pill-red">+{row.delay_minutes}m</span>
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
          <SectionCard title="Weekly Hours" subtitle="Current month">
            {loading ? (
              <div className="skeleton h-28 rounded" />
            ) : weeklyData.length === 0 ? (
              <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No hours logged yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={110}>
                <BarChart data={weeklyData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={customTooltip} cursor={{ fill: 'var(--bg)' }} />
                  <Bar dataKey="hours" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={40} />
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
              <ResponsiveContainer width="100%" height={110}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={28} outerRadius={44} dataKey="value" paddingAngle={3}>
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                  </Pie>
                  <Tooltip formatter={(v, n) => [v, n]} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active Projects */}
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
            Active Projects
          </p>
          {loading ? (
            <div className="space-y-3">
              <div className="skeleton h-10 w-16 rounded" />
              <div className="skeleton h-2 rounded-full" />
            </div>
          ) : (
            <>
              <p className="text-4xl font-bold mb-4" style={{ color: 'var(--text)' }}>
                {stats.activeProjects ?? '—'}
              </p>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                <div className="h-full rounded-full" style={{ width: '70%', background: 'var(--primary)' }} />
              </div>
              <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>in progress</p>
            </>
          )}
        </div>

        {/* Top Workers */}
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
            Top Workers This Month
          </p>
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
                <div key={w.id} className="flex items-center gap-3">
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ background: i === 0 ? '#EF9F27' : i === 1 ? '#9CA3AF' : '#D97706' }}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium truncate" style={{ color: 'var(--text)' }}>
                    {w.name}
                  </span>
                  <span className="text-sm font-bold" style={{ color: 'var(--primary)' }}>
                    {parseFloat(w.total_hours || 0).toFixed(1)}h
                  </span>
                </div>
              ))}
              {!data?.topWorkers?.length && (
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No data yet</p>
              )}
            </div>
          )}
        </div>

        {/* Absence Alerts */}
        <div className="card p-5">
          <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>
            Absence Alerts
          </p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--danger-light)', border: '1px solid #FECACA' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--danger)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--danger)' }}>
                  {stats.absent || 0} absent today
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--warning-light)', border: '1px solid #FDE68A' }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--warning)' }} />
                <span className="text-sm font-semibold" style={{ color: '#D97706' }}>
                  {stats.late || 0} late arrivals
                </span>
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
    </div>
  );
}

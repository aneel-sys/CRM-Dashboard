import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { MdPeople, MdAccessTime, MdPersonOff, MdAvTimer } from 'react-icons/md';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const STATUS_COLORS = {
  'On Time': { bg: 'bg-green-100 text-green-700', text: 'On Time' },
  'Late': { bg: 'bg-red-100 text-red-600', text: 'Late' },
  'Absent': { bg: 'bg-gray-100 text-gray-500', text: 'Absent' },
};

const DONUT_COLORS = ['#1D9E75', '#378ADD', '#6b7280', '#E24B4A'];

function formatTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      .catch(err => toast(err.response?.data?.message || 'Failed to load overview data'))
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
    { name: 'Absent', value: data?.attendanceBreakdown?.absent || 0 },
  ].filter(d => d.value > 0);

  return (
    <div className="fade-in space-y-6">
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Present Today" value={stats.present} sub={`of ${stats.total} employees`} icon={MdPeople} color="#1D9E75" loading={loading} />
        <StatCard title="Late Today" value={stats.late} sub="after 09:00 AM" icon={MdAccessTime} color="#EF9F27" loading={loading} />
        <StatCard title="Absent Today" value={stats.absent} sub="not clocked in" icon={MdPersonOff} color="#E24B4A" loading={loading} />
        <StatCard title="Hours This Month" value={stats.monthHours} sub="across all projects" icon={MdAvTimer} color="#378ADD" loading={loading} />
      </div>

      {/* Mid row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Late Arrivals Table */}
        <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">Late Arrivals Today</h3>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}</div>
          ) : data?.lateArrivals?.length === 0 ? (
            <div className="text-center py-8 text-[var(--color-muted)] text-sm">✅ No late arrivals today</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-[var(--color-muted)] text-xs uppercase tracking-wider">
                    <th className="text-left py-2 px-1">Employee</th>
                    <th className="text-left py-2 px-1">Clock In</th>
                    <th className="text-left py-2 px-1">Delay</th>
                    <th className="text-left py-2 px-1">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.lateArrivals || []).map(row => (
                    <tr key={row.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]">
                      <td className="py-2.5 px-1">
                        <div className="font-medium text-[var(--color-text)]">{row.name}</div>
                        <div className="text-xs text-[var(--color-muted)]">{row.department}</div>
                      </td>
                      <td className="py-2.5 px-1 font-medium text-red-500">{formatTime(row.clock_in_time)}</td>
                      <td className="py-2.5 px-1">
                        <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                          +{row.delay_minutes}m
                        </span>
                      </td>
                      <td className="py-2.5 px-1">
                        <span className="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded-full">Late</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Charts column */}
        <div className="flex flex-col gap-4">
          {/* Weekly bar chart */}
          <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">Weekly Hours This Month</h3>
            {loading ? <div className="skeleton h-32 rounded" /> : (
              <ResponsiveContainer width="100%" height={120}>
                <BarChart data={weeklyData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={v => [`${v}h`, 'Hours']} />
                  <Bar dataKey="hours" fill="#1D9E75" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Donut chart */}
          <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
            <h3 className="font-semibold text-[var(--color-text)] mb-2">Today's Attendance</h3>
            {loading ? <div className="skeleton h-28 rounded" /> : (
              <ResponsiveContainer width="100%" height={120}>
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value">
                    {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Active Projects */}
        <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="text-xs text-[var(--color-muted)] font-semibold uppercase tracking-wider mb-2">Active Projects</div>
          {loading ? <div className="skeleton h-16 rounded" /> : (
            <>
              <div className="text-4xl font-bold text-[var(--color-text)]">{stats.activeProjects ?? '—'}</div>
              <div className="mt-3 h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                <div className="h-full bg-[#1D9E75] rounded-full" style={{ width: '70%' }} />
              </div>
              <div className="text-xs text-[var(--color-muted)] mt-1">in progress</div>
            </>
          )}
        </div>

        {/* Top Workers */}
        <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="text-xs text-[var(--color-muted)] font-semibold uppercase tracking-wider mb-3">Top Workers This Month</div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-6 rounded" />)}</div>
          ) : (
            <div className="space-y-2">
              {(data?.topWorkers || []).slice(0, 3).map((w, i) => (
                <div key={w.id} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[var(--color-muted)] w-4">#{i + 1}</span>
                  <span className="flex-1 text-sm text-[var(--color-text)] truncate">{w.name}</span>
                  <span className="text-sm font-semibold text-[#1D9E75]">{parseFloat(w.total_hours).toFixed(1)}h</span>
                </div>
              ))}
              {!data?.topWorkers?.length && <div className="text-sm text-[var(--color-muted)]">No data yet</div>}
            </div>
          )}
        </div>

        {/* Absence Alerts */}
        <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="text-xs text-[var(--color-muted)] font-semibold uppercase tracking-wider mb-3">Absence Alerts</div>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-8 rounded" />)}</div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                <span className="text-red-600 font-medium">{stats.absent || 0} absent today</span>
              </div>
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                <span className="text-amber-700 font-medium">{stats.late || 0} late arrivals</span>
              </div>
              <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm">
                <span className="w-2 h-2 rounded-full bg-green-500 shrink-0"></span>
                <span className="text-green-700 font-medium">{stats.present || 0} on time today</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

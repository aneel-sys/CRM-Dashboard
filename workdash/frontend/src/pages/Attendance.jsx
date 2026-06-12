import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import {
  MdDownload, MdPeople, MdAccessTime, MdPersonOff, MdCheckCircle,
} from 'react-icons/md';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { useToast } from '../components/Toast';
import api from '../api/axios';
import { fmtTime } from '../utils/time';
import { useSettings } from '../context/SettingsContext';
import { useSSE } from '../context/SSEContext';

// Same color language as the stat cards: On Time green · Late amber · Absent red
function StatusPill({ status }) {
  const map = {
    'On Time': 'pill pill-green',
    'Late':    'pill pill-amber',
    'Absent':  'pill pill-red',
  };
  return <span className={map[status] || 'pill pill-gray'}>{status}</span>;
}

const trendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs" style={{ boxShadow: 'var(--card-shadow-md)', minWidth: 110 }}>
      <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

function LateOffendersCard({ offenders, loading, days }) {
  const navigate = useNavigate();
  const pctColor = pct => pct >= 50 ? '#E24B4A' : pct >= 25 ? '#EF9F27' : 'var(--text-muted)';
  return (
    <div className="card overflow-hidden h-full flex flex-col">
      <div className="px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
        <p className="section-title">Frequent Late Arrivals</p>
        <p className="section-sub">Last {days} days · most late days first</p>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-9 rounded" />)}</div>
        ) : offenders.length === 0 ? (
          <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
            <p className="text-sm">No late arrivals in this period 🎉</p>
          </div>
        ) : (
          <div className="space-y-1">
            {offenders.map((o, i) => (
              <div
                key={o.id}
                className="flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer transition-colors"
                style={{ background: 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                onClick={() => navigate(`/person?id=${o.id}`)}
              >
                <span className="text-[11px] font-bold w-4 text-center shrink-0" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)' }}>{o.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, o.latePct)}%`, background: pctColor(o.latePct) }} />
                    </div>
                    <span className="text-[10px] font-bold shrink-0" style={{ color: pctColor(o.latePct) }}>{o.latePct}%</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>{o.lateDays}<span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>/{o.presentDays}d</span></p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>last: {o.lastLate}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Attendance() {
  const { refreshKey } = useOutletContext();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const sseTick = useSSE('tick');
  const prevTickRef = useRef(0);

  const { timeFormat } = useSettings();
  const fmt = dt => fmtTime(dt, timeFormat);
  const [date, setDate] = useState(() => searchParams.get('date') || today);
  const [deptId, setDeptId] = useState(() => searchParams.get('dept') || '');
  // Pre-apply filters from URL params (e.g. heatmap cell click, KPI card click)
  const [status, setStatus] = useState(() => searchParams.get('status') || '');
  const [search, setSearch] = useState('');
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trend, setTrend] = useState([]);
  const [trendLoading, setTrendLoading] = useState(true);
  const [offenders, setOffenders] = useState([]);
  const [offendersLoading, setOffendersLoading] = useState(true);
  const [trendDays, setTrendDays] = useState(30);

  useEffect(() => {
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setTrendLoading(true);
    api.get(`/attendance/trend?days=${trendDays}`)
      .then(res => setTrend(res.data.trend || []))
      .catch(() => {})
      .finally(() => setTrendLoading(false));
    setOffendersLoading(true);
    api.get(`/attendance/late-offenders?days=${trendDays}`)
      .then(res => setOffenders(res.data.offenders || []))
      .catch(() => {})
      .finally(() => setOffendersLoading(false));
  }, [refreshKey, trendDays]);

  const fetchData = () => {
    setLoading(true);
    const p = new URLSearchParams({ date });
    if (deptId) p.set('department_id', deptId);
    if (status) p.set('status', status);
    api.get(`/attendance?${p}`)
      .then(res => setData(res.data))
      .catch(err => toast(err.response?.data?.message || 'Failed to load attendance'))
      .finally(() => setLoading(false));
  };

  // Auto-apply: refetch whenever any filter changes (also picks up URL params on mount)
  useEffect(() => { fetchData(); }, [refreshKey, date, deptId, status]);

  // SSE tick — silently re-fetch when viewing today's data
  useEffect(() => {
    if (!sseTick?.ts || sseTick.ts <= prevTickRef.current) return;
    prevTickRef.current = sseTick.ts;
    if (date === today) fetchData();
  }, [sseTick]);

  const handleExport = () => {
    const p = new URLSearchParams({ date });
    if (deptId) p.set('department_id', deptId);
    if (status) p.set('status', status);
    window.open(`/api/attendance/export?${p}`, '_blank');
  };

  const stats = data?.stats || {};
  // Absent breakdown: how many of the absentees actually have an approved leave
  const absentOnLeave = (data?.records || [])
    .filter(r => r.attendance_status === 'Absent' && r.leave_status === 'approved').length;

  // Keep bar labels readable: daily bars for week/month, weekly totals for 3 months
  const chartData = (() => {
    if (trendDays === 7) return trend;
    if (trendDays === 30) return trend.slice(-22);
    const weeks = {};
    trend.forEach(t => {
      const d = new Date(`${t.date}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // back to Monday
      const key = d.toISOString().slice(0, 10);
      if (!weeks[key]) {
        weeks[key] = {
          label: `w/c ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })}`,
          onTime: 0, late: 0, absent: 0,
        };
      }
      weeks[key].onTime += t.onTime;
      weeks[key].late   += t.late;
      weeks[key].absent += t.absent;
    });
    return Object.keys(weeks).sort().map(k => weeks[k]);
  })();

  const COLUMNS = [
    { key: 'idx', label: '#', align: 'center', render: (_, __, i) => <span style={{ color: 'var(--text-muted)' }}>{i + 1}</span> },
    {
      key: 'name', label: 'Employee',
      render: (v, row) => (
        <div
          onClick={() => navigate(`/person?id=${row.id}`)}
          style={{ cursor: 'pointer' }}
          title="View person report"
          onMouseEnter={e => e.currentTarget.firstChild.style.color = 'var(--primary)'}
          onMouseLeave={e => e.currentTarget.firstChild.style.color = 'var(--text)'}
        >
          <p className="font-semibold" style={{ color: 'var(--text)', transition: 'color 0.12s' }}>{v}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{row.department}</p>
        </div>
      ),
    },
    { key: 'designation', label: 'Role', render: v => <span style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span> },
    {
      key: 'clock_in_time', label: 'Clock In',
      render: (v, row) => (
        <span className="font-semibold" style={{ color: row.attendance_status === 'Late' ? '#D97706' : undefined }}>
          {fmt(v)}
        </span>
      ),
    },
    {
      key: 'clock_out_time', label: 'Clock Out',
      render: (v, row) => row.missing_clock_out
        ? <span className="pill pill-red" title="Employee did not clock out this day">Missing</span>
        : fmt(v),
    },
    {
      key: 'delay_minutes', label: 'Delay',
      render: v => v > 0
        ? <span className="pill pill-red">+{v}m</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      key: 'hours_worked', label: 'Hours',
      render: v => v
        ? <span className="font-bold" style={{ color: 'var(--primary)' }}>{parseFloat(v).toFixed(1)}h</span>
        : '—',
    },
    { key: 'attendance_status', label: 'Status', render: v => <StatusPill status={v} /> },
    {
      key: 'leave_type', label: 'Leave',
      render: (v, row) => {
        if (!v) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        const sColor = row.leave_status === 'approved' ? '#1D9E75'
                     : row.leave_status === 'pending'  ? '#D97706'
                     : '#E24B4A';
        const sBg    = row.leave_status === 'approved' ? '#ECFDF5'
                     : row.leave_status === 'pending'  ? '#FFFBEB'
                     : '#FEF2F2';
        return (
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{v}</p>
            {row.leave_reason && (
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)', maxWidth: 160 }}>{row.leave_reason}</p>
            )}
            <span style={{ display: 'inline-block', marginTop: 3, fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 20, color: sColor, background: sBg }}>
              {row.leave_status}
            </span>
          </div>
        );
      },
    },
  ];

  const tableData = (data?.records || [])
    .filter(r => !search || (r.name || '').toLowerCase().includes(search.toLowerCase()))
    .map((r, i) => ({ ...r, idx: i + 1 }));

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
  });

  return (
    <div className="space-y-5 fade-up">
      {/* Filter Bar */}
      <div className="card px-5 py-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="form-input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Department</label>
          <select value={deptId} onChange={e => setDeptId(e.target.value)} className="form-input form-select" style={{ paddingRight: 28 }}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Status</label>
          <select value={status} onChange={e => setStatus(e.target.value)} className="form-input form-select" style={{ paddingRight: 28 }}>
            <option value="">All Statuses</option>
            <option value="On Time">On Time</option>
            <option value="Late">Late</option>
            <option value="Absent">Absent</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Search</label>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Employee name…"
            className="form-input"
            style={{ minWidth: 170 }}
          />
        </div>
        <button onClick={handleExport} className="btn btn-secondary ml-auto">
          <MdDownload size={15} /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="On Time"     value={stats.onTime}  icon={MdCheckCircle} color="#1D9E75" loading={loading}
          sub={stats.present > 0 ? `of ${stats.present} who clocked in` : undefined} />
        <StatCard title="Late"        value={stats.late}    icon={MdAccessTime}  color="#EF9F27" loading={loading}
          sub={stats.present > 0 ? `of ${stats.present} who clocked in` : undefined} />
        <StatCard title="Absent"      value={stats.absent}  icon={MdPersonOff}   color="#E24B4A" loading={loading}
          sub={stats.absent > 0
            ? `${absentOnLeave} on approved leave · ${Math.max(0, (stats.absent || 0) - absentOnLeave)} no record`
            : undefined} />
        <StatCard title="Total Staff" value={stats.total}   icon={MdPeople}      color="#378ADD" loading={loading}
          sub={stats.total > 0 ? `${stats.present ?? 0} in · ${stats.absent ?? 0} out` : undefined} />
      </div>

      {/* 30-Day Trend Chart + Frequent Late Arrivals */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card overflow-hidden h-full flex flex-col lg:col-span-3">
          <div className="flex items-center justify-between px-5 py-4 shrink-0 flex-wrap gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <p className="section-title">Attendance Trend</p>
              <p className="section-sub">
                {trendDays === 90 ? 'Weekly totals (person-days)' : 'Working days only'} · weekends &amp; holidays excluded
              </p>
            </div>
            <div className="flex gap-1">
              {[[7, 'Week'], [30, 'Month'], [90, '3 Months']].map(([val, label]) => (
                <button key={val} onClick={() => setTrendDays(val)}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={trendDays === val
                    ? { background: 'var(--primary)', color: '#fff' }
                    : { background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-5 py-4 flex-1 flex flex-col justify-center">
            {trendLoading ? (
              <div className="skeleton h-36 rounded" />
            ) : chartData.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No attendance history yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220} minHeight={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -16 }} barCategoryGap="30%">
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip content={trendTooltip} cursor={{ fill: 'var(--bg)' }} />
                  <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                  <Bar dataKey="onTime"  name="On Time" stackId="a" fill="#1D9E75" radius={[0, 0, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="late"    name="Late"    stackId="a" fill="#EF9F27" radius={[0, 0, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="absent"  name="Absent"  stackId="a" fill="#E24B4A" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="lg:col-span-2 h-full">
          <LateOffendersCard offenders={offenders} loading={offendersLoading} days={trendDays} />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="section-title">Attendance Log</p>
            <p className="section-sub">
              {dateLabel} · {tableData.length} record{tableData.length !== 1 ? 's' : ''}
              {status ? ` · Filtered: ${status}` : ''}
              {search ? ` · Search: "${search}"` : ''}
            </p>
          </div>
        </div>
        {date > today ? (
          <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
            <svg width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.25, marginBottom: 12 }}>
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm font-medium">No data for future dates</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Select today or a past date to view attendance records</p>
          </div>
        ) : (
          <DataTable columns={COLUMNS} data={tableData} loading={loading} emptyMessage="No attendance records for this date" />
        )}
      </div>
    </div>
  );
}

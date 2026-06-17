import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { MdDownload, MdAvTimer, MdPeople, MdToday, MdList } from 'react-icons/md';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const PRESETS = [
  { id: '7d',    label: 'Last 7 Days'  },
  { id: '30d',   label: 'Last 30 Days' },
  { id: '90d',   label: 'Last 90 Days' },
  { id: 'year',  label: 'This Year'    },
  { id: 'custom',label: 'Custom Range' },
];

function presetDates(id) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  if (id === 'year') return { from: `${now.getFullYear()}-01-01`, to: todayStr };
  const days = id === '7d' ? 7 : id === '30d' ? 30 : id === '90d' ? 90 : null;
  if (days) { const d = new Date(now); d.setDate(d.getDate() - days + 1); return { from: d.toISOString().slice(0, 10), to: todayStr }; }
  return null;
}

export default function Timings() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const [preset, setPreset] = useState('30d');
  const _init = presetDates('30d');
  const [from, setFrom] = useState(_init.from);
  const [to, setTo]     = useState(_init.to);

  const handlePreset = (id) => {
    setPreset(id);
    if (id !== 'custom') { const d = presetDates(id); if (d) { setFrom(d.from); setTo(d.to); } }
  };
  const [userId, setUserId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/timings/filters')
      .then(res => { setEmployees(res.data.employees || []); setProjects(res.data.projects || []); })
      .catch(() => {});
  }, []);

  const fetchData = () => {
    setLoading(true);
    const p = new URLSearchParams({ from, to });
    if (userId) p.set('user_id', userId);
    if (projectId) p.set('project_id', projectId);
    api.get(`/timings?${p}`)
      .then(res => setData(res.data))
      .catch(err => toast(err.response?.data?.message || 'Failed to load timings'))
      .finally(() => setLoading(false));
  };

  // Auto-apply: refetch whenever any filter changes
  useEffect(() => { fetchData(); }, [refreshKey, from, to, userId, projectId]);

  const handleExport = () => {
    const p = new URLSearchParams({ from, to });
    if (userId) p.set('user_id', userId);
    if (projectId) p.set('project_id', projectId);
    window.open(`/api/timings/export?${p}`, '_blank');
  };

  const summary = data?.summary || {};

  const COLUMNS = [
    {
      key: 'employee_name', label: 'Employee',
      render: v => <span className="font-semibold" style={{ color: 'var(--text)' }}>{v}</span>,
    },
    {
      key: 'log_date', label: 'Date',
      render: v => <span style={{ color: 'var(--text-secondary)' }}>{v}</span>,
    },
    {
      key: 'project_name', label: 'Project',
      render: v => v
        ? <span className="pill pill-blue" style={{ fontWeight: 500 }}>{v}</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      key: 'task_name', label: 'Task',
      render: v => <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span>,
    },
    {
      key: 'total_hours', label: 'Hours', align: 'right',
      render: v => (
        <span className="font-bold" style={{ color: 'var(--primary)' }}>
          {parseFloat(v || 0).toFixed(2)}h
        </span>
      ),
    },
    {
      key: 'notes', label: 'Notes',
      render: v => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{v || '—'}</span>,
    },
  ];

  // Histogram of hours logged per person per day
  const distData = (() => {
    const byPersonDay = {};
    (data?.logs || []).forEach(l => {
      const k = `${l.user_id}:${l.log_date}`;
      byPersonDay[k] = (byPersonDay[k] || 0) + (parseFloat(l.total_hours) || 0);
    });
    const buckets = [
      { label: '<2h',   min: 0,  max: 2,        count: 0, color: '#E24B4A' },
      { label: '2–4h',  min: 2,  max: 4,        count: 0, color: '#EF9F27' },
      { label: '4–6h',  min: 4,  max: 6,        count: 0, color: '#EF9F27' },
      { label: '6–8h',  min: 6,  max: 8,        count: 0, color: '#1D9E75' },
      { label: '8–10h', min: 8,  max: 10,       count: 0, color: '#1D9E75' },
      { label: '10h+',  min: 10, max: Infinity, count: 0, color: '#7C3AED' },
    ];
    Object.values(byPersonDay).forEach(h => {
      const b = buckets.find(x => h >= x.min && h < x.max);
      if (b) b.count++;
    });
    return buckets;
  })();
  const distTotal = distData.reduce((s, b) => s + b.count, 0);

  return (
    <div className="space-y-5 fade-up">
      {/* Filter */}
      <div className="card px-5 py-4">
        {/* Preset row */}
        <div className="flex flex-wrap items-center gap-2 mb-4 pb-4" style={{ borderBottom: '1px solid var(--border)' }}>
          {PRESETS.map(p => (
            <button
              key={p.id}
              onClick={() => handlePreset(p.id)}
              style={{
                height: 33, padding: '0 15px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                fontWeight: preset === p.id ? 700 : 500,
                border: `1px solid ${preset === p.id ? 'var(--primary)' : 'var(--border)'}`,
                background: preset === p.id ? 'var(--primary)' : 'var(--card)',
                color: preset === p.id ? '#fff' : 'var(--text-secondary)',
                transition: 'all 0.15s',
              }}
            >
              {p.label}
            </button>
          ))}
          {preset !== 'custom' && (
            <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
              {from} → {to}
            </span>
          )}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-3 items-end">
          {preset === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>From</label>
                <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>To</label>
                <input type="date" value={to} max={today} onChange={e => setTo(e.target.value)} className="form-input" />
              </div>
            </>
          )}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Employee</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} className="form-input form-select" style={{ paddingRight: 28 }}>
              <option value="">All Employees</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Project</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} className="form-input form-select" style={{ paddingRight: 28 }}>
              <option value="">All Projects</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <MdDownload size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Hours"    value={`${summary.totalHours || '0.00'}h`}      icon={MdAvTimer}  color="#378ADD" loading={loading}
          sub={summary.totalEntries ? `from ${summary.totalEntries} log entries` : undefined} />
        <StatCard title="Avg/Employee"   value={`${summary.avgPerEmployee || '0.00'}h`}  icon={MdPeople}   color="#1D9E75" loading={loading}
          sub={summary.employees ? `${summary.totalHours}h across ${summary.employees} employee${summary.employees !== 1 ? 's' : ''}` : undefined} />
        <StatCard title="Avg/Day"        value={`${summary.avgPerDay || '0.00'}h`}        icon={MdToday}    color="#EF9F27" loading={loading}
          sub={summary.days ? `${summary.totalHours}h over ${summary.days} day${summary.days !== 1 ? 's' : ''} with logs` : undefined} />
        <StatCard title="Log Entries"    value={summary.totalEntries || 0}                icon={MdList}     color="#7C3AED" loading={loading}
          sub={summary.employees ? `by ${summary.employees} employee${summary.employees !== 1 ? 's' : ''}` : undefined} />
      </div>

      {/* Daily hours distribution */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="section-title">Daily Hours Distribution</p>
          <p className="section-sub">
            How much each person logged per day · {distTotal} person-day{distTotal !== 1 ? 's' : ''} in this period
          </p>
        </div>
        <div className="px-5 py-4">
          {loading ? (
            <div className="skeleton h-40 rounded" />
          ) : distTotal === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">No time logs in this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={distData} margin={{ top: 18, right: 8, bottom: 0, left: -22 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  formatter={(v, n, { payload }) => [
                    `${v} person-day${v !== 1 ? 's' : ''} (${distTotal > 0 ? Math.round((v / distTotal) * 100) : 0}%)`,
                    payload.label,
                  ]}
                  cursor={{ fill: 'var(--bg)' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {distData.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="section-title">Time Log Entries</p>
            <p className="section-sub">{from} → {to} · {data?.logs?.length || 0} entries</p>
          </div>
        </div>
        <DataTable
          columns={COLUMNS}
          data={data?.logs || []}
          loading={loading}
          emptyMessage="No time logs found for this period"
        />
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MdDownload, MdAvTimer, MdPeople, MdToday, MdList } from 'react-icons/md';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { useToast } from '../components/Toast';
import api from '../api/axios';

export default function Timings() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const [from, setFrom] = useState(firstDay);
  const [to, setTo] = useState(today);
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

  return (
    <div className="space-y-5 fade-up">
      {/* Filter */}
      <div className="card px-5 py-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="form-input" />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="form-input" />
        </div>
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

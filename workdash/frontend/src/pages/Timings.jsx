import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MdFilterList, MdDownload } from 'react-icons/md';
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
      .then(res => {
        setEmployees(res.data.employees || []);
        setProjects(res.data.projects || []);
      })
      .catch(() => {});
  }, []);

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams({ from, to });
    if (userId) params.set('user_id', userId);
    if (projectId) params.set('project_id', projectId);
    api.get(`/timings?${params}`)
      .then(res => setData(res.data))
      .catch(err => toast(err.response?.data?.message || 'Failed to load timings'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [refreshKey]);

  const handleExport = () => {
    const params = new URLSearchParams({ from, to });
    if (userId) params.set('user_id', userId);
    if (projectId) params.set('project_id', projectId);
    window.open(`/api/timings/export?${params}`, '_blank');
  };

  const summary = data?.summary || {};

  const COLUMNS = [
    {
      key: 'employee_name', label: 'Employee',
      render: v => <span className="font-medium text-[var(--color-text)]">{v}</span>
    },
    { key: 'log_date', label: 'Date' },
    { key: 'project_name', label: 'Project', render: v => v || '—' },
    { key: 'task_name', label: 'Task', render: v => v || '—' },
    {
      key: 'total_hours', label: 'Hours',
      render: v => <span className="text-[#1D9E75] font-semibold">{parseFloat(v || 0).toFixed(2)}h</span>
    },
    { key: 'notes', label: 'Notes', render: v => <span className="text-[var(--color-muted)] text-xs">{v || '—'}</span> },
  ];

  return (
    <div className="fade-in space-y-5">
      {/* Filter Bar */}
      <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">From</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">To</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Employee</label>
          <select value={userId} onChange={e => setUserId(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none"
          >
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Project</label>
          <select value={projectId} onChange={e => setProjectId(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none"
          >
            <option value="">All Projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button onClick={fetchData}
          className="flex items-center gap-1.5 bg-[#1D9E75] hover:bg-[#0F6E56] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <MdFilterList size={16} /> Apply
        </button>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] text-sm font-medium px-4 py-2 rounded-lg transition-colors ml-auto">
          <MdDownload size={16} /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Hours" value={`${summary.totalHours || '0.00'}h`} color="#378ADD" loading={loading} />
        <StatCard title="Avg / Employee" value={`${summary.avgPerEmployee || '0.00'}h`} color="#1D9E75" loading={loading} />
        <StatCard title="Avg / Day" value={`${summary.avgPerDay || '0.00'}h`} color="#EF9F27" loading={loading} />
        <StatCard title="Log Entries" value={summary.totalEntries || 0} color="#6b7280" loading={loading} />
      </div>

      {/* Table */}
      <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="font-semibold text-[var(--color-text)] mb-4">Time Log Entries</h3>
        <DataTable columns={COLUMNS} data={data?.logs || []} loading={loading} emptyMessage="No time logs found for this period" />
      </div>
    </div>
  );
}

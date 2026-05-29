import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { MdSearch, MdDownload, MdOpenInNew } from 'react-icons/md';
import DataTable from '../components/DataTable';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function AttendancePill({ pct }) {
  const color = pct >= 80 ? '#1D9E75' : pct >= 60 ? '#EF9F27' : '#E24B4A';
  return (
    <div className="flex items-center gap-2 min-w-28">
      <div className="flex-1 h-1.5 bg-[var(--color-border)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{pct}%</span>
    </div>
  );
}

function formatLastSeen(dt) {
  if (!dt) return <span className="text-[var(--color-muted)]">—</span>;
  const d = new Date(dt);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Team() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const navigate = useNavigate();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [search, setSearch] = useState('');
  const [deptId, setDeptId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments || []))
      .catch(() => {});
  }, []);

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams({ month, year });
    if (deptId) params.set('department_id', deptId);
    if (search) params.set('search', search);
    api.get(`/team?${params}`)
      .then(res => setEmployees(res.data.employees || []))
      .catch(err => toast(err.response?.data?.message || 'Failed to load team data'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [refreshKey]);

  const handleExport = () => {
    window.open(`/api/team/export?month=${month}&year=${year}`, '_blank');
  };

  const COLUMNS = [
    {
      key: 'name', label: 'Employee',
      render: (v, row) => (
        <div>
          <div className="font-medium text-[var(--color-text)]">{v}</div>
          <div className="text-xs text-[var(--color-muted)]">{row.email}</div>
        </div>
      )
    },
    { key: 'department', label: 'Department', render: v => v || '—' },
    { key: 'designation', label: 'Designation', render: v => v || '—' },
    {
      key: 'month_hours', label: 'Month Hours',
      render: v => <span className="font-semibold text-[#378ADD]">{parseFloat(v || 0).toFixed(1)}h</span>
    },
    {
      key: 'attendance_pct', label: 'Attendance',
      render: v => <AttendancePill pct={v || 0} />
    },
    {
      key: 'active_projects', label: 'Projects',
      render: v => <span className="text-center block">{v || 0}</span>
    },
    {
      key: 'last_seen', label: 'Last Seen',
      render: (v, row) => (
        <span className={
          row.today_status === 'Late' ? 'text-red-500 font-medium' :
          !v ? 'text-[var(--color-muted)]' : 'text-[var(--color-text)]'
        }>
          {formatLastSeen(v)}
          {row.today_status === 'Late' && <span className="text-xs ml-1">(Late)</span>}
        </span>
      )
    },
    {
      key: 'id', label: '',
      render: (v) => (
        <button
          onClick={() => navigate(`/person?id=${v}`)}
          className="flex items-center gap-1 text-xs text-[#1D9E75] hover:text-[#0F6E56] font-medium transition-colors"
        >
          View <MdOpenInNew size={13} />
        </button>
      )
    },
  ];

  return (
    <div className="fade-in space-y-5">
      {/* Filter Bar */}
      <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-4 flex flex-wrap gap-3 items-end">
        <div className="relative">
          <label className="block text-xs text-[var(--color-muted)] mb-1">Search</label>
          <div className="relative">
            <MdSearch size={16} className="absolute left-2.5 top-2.5 text-[var(--color-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchData()}
              placeholder="Search by name…"
              className="border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#1D9E75] w-44"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Department</label>
          <select value={deptId} onChange={e => setDeptId(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Month</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none">
            {[2023,2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={fetchData}
          className="bg-[#1D9E75] hover:bg-[#0F6E56] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          Apply
        </button>
        <button onClick={handleExport}
          className="flex items-center gap-1.5 border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] text-sm font-medium px-4 py-2 rounded-lg transition-colors ml-auto">
          <MdDownload size={16} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="font-semibold text-[var(--color-text)] mb-4">
          All Employees — {MONTH_NAMES[month - 1]} {year}
        </h3>
        <DataTable columns={COLUMNS} data={employees} loading={loading} emptyMessage="No employees found" />
      </div>
    </div>
  );
}

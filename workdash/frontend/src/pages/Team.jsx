import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { MdSearch, MdDownload, MdArrowForward } from 'react-icons/md';
import DataTable from '../components/DataTable';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function AttendanceBar({ pct }) {
  const color = pct >= 80 ? 'var(--primary)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  return (
    <div className="flex items-center gap-2 min-w-[100px]">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-xs font-bold w-8 text-right" style={{ color }}>{pct}%</span>
    </div>
  );
}

function Avatar({ name, size = 28 }) {
  const initials = name ? name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() : '?';
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: 'var(--primary)', fontSize: size * 0.38 }}
    >
      {initials}
    </div>
  );
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
    const p = new URLSearchParams({ month, year });
    if (deptId) p.set('department_id', deptId);
    if (search) p.set('search', search);
    api.get(`/team?${p}`)
      .then(res => setEmployees(res.data.employees || []))
      .catch(err => toast(err.response?.data?.message || 'Failed to load team'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [refreshKey]);

  const handleExport = () => window.open(`/api/team/export?month=${month}&year=${year}`, '_blank');

  const COLUMNS = [
    {
      key: 'name', label: 'Employee',
      render: (v, row) => (
        <div className="flex items-center gap-2.5">
          <Avatar name={v} />
          <div>
            <p className="font-semibold text-[13px]" style={{ color: 'var(--text)' }}>{v}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'department', label: 'Department',
      render: v => <span style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span>,
    },
    {
      key: 'designation', label: 'Role',
      render: v => <span style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span>,
    },
    {
      key: 'today_status', label: 'Today',
      render: (v) => {
        if (!v) return <span className="pill pill-gray">Absent</span>;
        if (v === 'Late') return <span className="pill pill-amber">Late</span>;
        return <span className="pill pill-green">Present</span>;
      },
    },
    {
      key: 'avg_clock_in', label: 'Avg Clock-In',
      render: (v, row) => {
        if (!v) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
        const clockMins = toMins(v);
        const shiftMins = row.avg_shift_start ? toMins(row.avg_shift_start) : 9 * 60;
        const isLate = clockMins > shiftMins + 20;
        return (
          <span className="font-semibold text-sm" style={{ color: isLate ? 'var(--warning)' : 'var(--primary)' }}>
            {v}
          </span>
        );
      },
    },
    {
      key: 'month_hours', label: 'Month Hours',
      render: v => <span className="font-bold" style={{ color: 'var(--info)' }}>{parseFloat(v || 0).toFixed(1)}h</span>,
    },
    {
      key: 'attendance_pct', label: 'Attendance',
      render: v => <AttendanceBar pct={v || 0} />,
    },
    {
      key: 'active_projects', label: 'Projects', align: 'center',
      render: v => (
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold"
          style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)' }}
        >
          {v || 0}
        </span>
      ),
    },
    {
      key: 'last_seen', label: 'Last Seen',
      render: (v, row) => {
        if (!v) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        const t = new Date(v).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
        const isLate = row.today_status === 'Late';
        return (
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: isLate ? 'var(--warning)' : 'var(--primary)' }} />
            <span className="text-xs" style={{ color: isLate ? 'var(--warning)' : 'var(--text)' }}>
              {t}{isLate ? ' · Late' : ''}
            </span>
          </div>
        );
      },
    },
    {
      key: 'id', label: '', align: 'right',
      render: v => (
        <button
          onClick={() => navigate(`/person?id=${v}`)}
          className="btn btn-ghost gap-1 text-xs"
          style={{ height: 28, padding: '0 8px', color: 'var(--primary)' }}
        >
          View <MdArrowForward size={13} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-5 fade-up">
      {/* Filter */}
      <div className="card px-5 py-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Search</label>
          <div className="relative">
            <MdSearch size={15} className="absolute left-2.5 top-[50%] -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchData()}
              placeholder="Search by name…"
              className="form-input"
              style={{ paddingLeft: 28, width: 180 }}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Department</label>
          <select value={deptId} onChange={e => setDeptId(e.target.value)} className="form-input form-select" style={{ paddingRight: 28 }}>
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Month</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="form-input form-select" style={{ paddingRight: 28 }}>
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Year</label>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="form-input form-select" style={{ paddingRight: 28 }}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={fetchData} className="btn btn-primary">Apply</button>
        <button onClick={handleExport} className="btn btn-secondary ml-auto">
          <MdDownload size={15} /> Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="section-title">All Employees — {MONTHS[month - 1]} {year}</p>
            <p className="section-sub">{employees.length} active employees</p>
          </div>
        </div>
        <DataTable columns={COLUMNS} data={employees} loading={loading} emptyMessage="No employees found" />
      </div>
    </div>
  );
}

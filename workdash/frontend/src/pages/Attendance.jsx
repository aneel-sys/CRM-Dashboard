import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MdFilterList, MdDownload } from 'react-icons/md';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { useToast } from '../components/Toast';
import api from '../api/axios';

function StatusPill({ status }) {
  const map = {
    'On Time': 'bg-green-100 text-green-700',
    'Late': 'bg-red-100 text-red-600',
    'Absent': 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${map[status] || 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function formatTime(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Attendance() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [deptId, setDeptId] = useState('');
  const [status, setStatus] = useState('');
  const [departments, setDepartments] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/attendance/departments')
      .then(res => setDepartments(res.data.departments || []))
      .catch(() => {});
  }, []);

  const fetchData = () => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (deptId) params.set('department_id', deptId);
    if (status) params.set('status', status);
    api.get(`/attendance?${params}`)
      .then(res => setData(res.data))
      .catch(err => toast(err.response?.data?.message || 'Failed to load attendance'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [refreshKey]);

  const handleExport = () => {
    const params = new URLSearchParams({ date });
    if (deptId) params.set('department_id', deptId);
    window.open(`/api/attendance/export?${params}`, '_blank');
  };

  const COLUMNS = [
    { key: 'idx', label: '#', render: (_, __, i) => i + 1 },
    {
      key: 'name', label: 'Employee',
      render: (v, row) => (
        <div>
          <div className="font-medium text-[var(--color-text)]">{v}</div>
          <div className="text-xs text-[var(--color-muted)]">{row.department}</div>
        </div>
      )
    },
    { key: 'designation', label: 'Designation' },
    {
      key: 'clock_in_time', label: 'Clock In',
      render: (v, row) => (
        <span className={row.attendance_status === 'Late' ? 'text-red-500 font-semibold' : ''}>
          {formatTime(v)}
        </span>
      )
    },
    { key: 'clock_out_time', label: 'Clock Out', render: v => formatTime(v) },
    {
      key: 'delay_minutes', label: 'Delay',
      render: v => v > 0
        ? <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-0.5 rounded-full">+{v}m</span>
        : '—'
    },
    {
      key: 'hours_worked', label: 'Hours',
      render: v => v ? <span className="text-[#1D9E75] font-semibold">{parseFloat(v).toFixed(1)}h</span> : '—'
    },
    { key: 'attendance_status', label: 'Status', render: v => <StatusPill status={v} /> },
  ];

  // Fix: DataTable render gets (value, row) but idx column needs index
  const tableData = (data?.records || []).map((r, i) => ({ ...r, idx: i + 1 }));

  const stats = data?.stats || {};

  return (
    <div className="fade-in space-y-5">
      {/* Filter Bar */}
      <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          />
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Department</label>
          <select
            value={deptId}
            onChange={e => setDeptId(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          >
            <option value="">All Departments</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Status</label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          >
            <option value="">All Statuses</option>
            <option value="On Time">On Time</option>
            <option value="Late">Late</option>
            <option value="Absent">Absent</option>
          </select>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 bg-[#1D9E75] hover:bg-[#0F6E56] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <MdFilterList size={16} /> Apply
        </button>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 border border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)] text-sm font-medium px-4 py-2 rounded-lg transition-colors ml-auto"
        >
          <MdDownload size={16} /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="On Time" value={stats.onTime} color="#1D9E75" loading={loading} />
        <StatCard title="Late" value={stats.late} color="#EF9F27" loading={loading} />
        <StatCard title="Absent" value={stats.absent} color="#E24B4A" loading={loading} />
        <StatCard title="Total Staff" value={stats.total} color="#378ADD" loading={loading} />
      </div>

      {/* Table */}
      <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
        <h3 className="font-semibold text-[var(--color-text)] mb-4">
          Attendance Log — {date}
        </h3>
        <DataTable columns={COLUMNS} data={tableData} loading={loading} emptyMessage="No attendance records for this date" />
      </div>
    </div>
  );
}

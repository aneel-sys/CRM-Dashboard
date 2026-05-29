import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MdFilterList, MdDownload, MdPeople, MdAccessTime, MdPersonOff, MdCheckCircle } from 'react-icons/md';
import StatCard from '../components/StatCard';
import DataTable from '../components/DataTable';
import { useToast } from '../components/Toast';
import api from '../api/axios';

function StatusPill({ status }) {
  const map = {
    'On Time': 'pill pill-green',
    'Late':    'pill pill-red',
    'Absent':  'pill pill-gray',
  };
  return <span className={map[status] || 'pill pill-gray'}>{status}</span>;
}

function fmt(dt) {
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
    const p = new URLSearchParams({ date });
    if (deptId) p.set('department_id', deptId);
    if (status) p.set('status', status);
    api.get(`/attendance?${p}`)
      .then(res => setData(res.data))
      .catch(err => toast(err.response?.data?.message || 'Failed to load attendance'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, [refreshKey]);

  const handleExport = () => {
    const p = new URLSearchParams({ date });
    if (deptId) p.set('department_id', deptId);
    window.open(`/api/attendance/export?${p}`, '_blank');
  };

  const stats = data?.stats || {};

  const COLUMNS = [
    { key: 'idx',    label: '#',          align: 'center', render: (_, __, i) => <span style={{ color: 'var(--text-muted)' }}>{i + 1}</span> },
    {
      key: 'name', label: 'Employee',
      render: (v, row) => (
        <div>
          <p className="font-semibold" style={{ color: 'var(--text)' }}>{v}</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{row.department}</p>
        </div>
      ),
    },
    { key: 'designation', label: 'Role', render: v => <span style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span> },
    {
      key: 'clock_in_time', label: 'Clock In',
      render: (v, row) => (
        <span className={`font-semibold ${row.attendance_status === 'Late' ? 'text-red-500' : ''}`}>
          {fmt(v)}
        </span>
      ),
    },
    { key: 'clock_out_time', label: 'Clock Out', render: v => fmt(v) },
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
  ];

  const tableData = (data?.records || []).map((r, i) => ({ ...r, idx: i + 1 }));

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
        <button onClick={fetchData} className="btn btn-primary">
          <MdFilterList size={15} /> Apply Filters
        </button>
        <button onClick={handleExport} className="btn btn-secondary ml-auto">
          <MdDownload size={15} /> Export CSV
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="On Time"    value={stats.onTime}  icon={MdCheckCircle} color="#1D9E75" loading={loading} />
        <StatCard title="Late"       value={stats.late}    icon={MdAccessTime}  color="#EF9F27" loading={loading} />
        <StatCard title="Absent"     value={stats.absent}  icon={MdPersonOff}   color="#E24B4A" loading={loading} />
        <StatCard title="Total Staff" value={stats.total}  icon={MdPeople}      color="#378ADD" loading={loading} />
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="section-title">Attendance Log</p>
            <p className="section-sub">{date} · {tableData.length} records</p>
          </div>
        </div>
        <DataTable columns={COLUMNS} data={tableData} loading={loading} emptyMessage="No attendance records for this date" />
      </div>
    </div>
  );
}

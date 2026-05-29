import { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PROJ_COLORS = ['#1D9E75','#378ADD','#EF9F27','#E24B4A','#7C3AED','#EC4899','#0891B2'];

function Avatar({ name, size = 64 }) {
  const initials = name
    ? name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, background: 'var(--primary)', fontSize: size * 0.35 }}
    >
      {initials}
    </div>
  );
}

function KpiBox({ label, value, color }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
      <p className="text-[22px] font-bold leading-none mb-1" style={{ color }}>{value ?? '—'}</p>
      <p className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

export default function PersonReport() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const now = new Date();

  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/employees')
      .then(res => {
        const emps = res.data.employees || [];
        setEmployees(emps);
        if (!selectedId && emps.length) setSelectedId(String(emps[0].id));
      })
      .catch(() => {});
  }, []);

  const loadReport = () => {
    if (!selectedId) return;
    setLoading(true);
    api.get(`/employees/${selectedId}/report?month=${month}&year=${year}`)
      .then(res => setReport(res.data))
      .catch(err => toast(err.response?.data?.message || 'Failed to load report'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (selectedId) loadReport(); }, [selectedId, refreshKey]);

  const stats = report?.stats || {};
  const emp   = report?.employee || {};

  const dailyData = (report?.dailyHours || []).map(d => ({
    date: new Date(d.date).getDate(),
    hours: d.hours,
    late: d.is_late,
  }));

  const projectData = (report?.projectHours || []).map(p => ({
    name: p.name.length > 22 ? p.name.slice(0, 20) + '…' : p.name,
    hours: parseFloat(p.hours) || 0,
  }));

  const maxProjHours = Math.max(...projectData.map(p => p.hours), 1);

  return (
    <div className="space-y-5 fade-up">
      {/* Filter */}
      <div className="card px-5 py-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Employee</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)} className="form-input form-select" style={{ minWidth: 200, paddingRight: 28 }}>
            <option value="">Select employee…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
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
        <button onClick={loadReport} className="btn btn-primary">Load Report</button>
      </div>

      {!selectedId ? (
        <div className="card flex flex-col items-center justify-center py-24" style={{ color: 'var(--text-muted)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12, opacity: 0.25 }}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
          </svg>
          <p className="text-sm font-medium">Select an employee to view their monthly report</p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-4">
            <div className="skeleton h-24 rounded-xl" />
            <div className="skeleton h-52 rounded-xl" />
            <div className="skeleton h-44 rounded-xl" />
          </div>
          <div className="lg:col-span-2 skeleton h-[440px] rounded-xl" />
        </div>
      ) : report ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: Charts */}
          <div className="lg:col-span-3 space-y-4">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-3">
              <KpiBox label="Days Present" value={stats.presentDays} color="var(--primary)" />
              <KpiBox label="Late Days"    value={stats.lateDays}    color="var(--warning)" />
              <KpiBox label="Total Hours"  value={`${stats.totalHours}h`} color="var(--info)" />
            </div>

            {/* Daily hours chart */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="section-title">Daily Hours — {MONTHS[month - 1]} {year}</p>
                <p className="section-sub">Green = full day · Red = short or late</p>
              </div>
              <div className="p-5">
                {dailyData.length === 0 ? (
                  <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                    <p className="text-sm">No hours logged this month</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={dailyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={v => [`${v}h`, 'Hours']} labelFormatter={l => `Day ${l}`} />
                      <Bar dataKey="hours" radius={[3, 3, 0, 0]} maxBarSize={20}>
                        {dailyData.map((d, i) => (
                          <Cell key={i} fill={d.hours < 4 || d.late ? 'var(--danger)' : 'var(--primary)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Hours by project */}
            <div className="card overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <p className="section-title">Hours by Project</p>
              </div>
              <div className="p-5">
                {projectData.length === 0 ? (
                  <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                    <p className="text-sm">No project hours logged</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projectData.map((p, i) => (
                      <div key={i}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{p.name}</span>
                          <span className="text-xs font-bold" style={{ color: PROJ_COLORS[i % PROJ_COLORS.length] }}>
                            {p.hours.toFixed(1)}h
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(p.hours / maxProjHours) * 100}%`, background: PROJ_COLORS[i % PROJ_COLORS.length] }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Profile */}
          <div className="lg:col-span-2">
            <div className="card h-full overflow-hidden">
              {/* Header band */}
              <div className="px-6 py-6" style={{ background: 'linear-gradient(135deg, #1D9E75, #0F6E56)' }}>
                <div className="flex items-center gap-4">
                  <Avatar name={emp.name} size={56} />
                  <div>
                    <p className="text-white font-bold text-[16px] leading-tight">{emp.name}</p>
                    <p className="text-white/70 text-xs mt-0.5">{emp.department}</p>
                    <p className="text-white/50 text-[11px]">{emp.designation}</p>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-5">
                {/* Avg times */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Avg Clock-In</p>
                    <p className="text-[16px] font-bold" style={{ color: stats.avgClockIn > '09:00' ? 'var(--danger)' : 'var(--text)' }}>
                      {stats.avgClockIn || '—'}
                    </p>
                  </div>
                  <div className="rounded-lg p-3" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Avg Clock-Out</p>
                    <p className="text-[16px] font-bold" style={{ color: 'var(--text)' }}>{stats.avgClockOut || '—'}</p>
                  </div>
                </div>

                {/* Attendance rate */}
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Attendance Rate</span>
                    <span className="text-sm font-bold" style={{ color: stats.attendanceRate >= 80 ? 'var(--primary)' : 'var(--warning)' }}>
                      {stats.attendanceRate}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${stats.attendanceRate}%`,
                        background: stats.attendanceRate >= 80 ? 'var(--primary)' : 'var(--warning)',
                      }}
                    />
                  </div>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    {stats.presentDays} of {stats.workingDays} working days
                  </p>
                </div>

                {/* 2x2 grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Present', value: stats.presentDays, bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
                    { label: 'Late',    value: stats.lateDays,    bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
                    { label: 'Absent',  value: stats.absentDays,  bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
                    { label: 'Leave',   value: stats.leaveDays,   bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE' },
                  ].map(item => (
                    <div key={item.label} className="rounded-lg p-3 text-center" style={{ background: item.bg, border: `1px solid ${item.border}` }}>
                      <p className="text-[22px] font-bold" style={{ color: item.color }}>{item.value ?? '—'}</p>
                      <p className="text-[11px] font-semibold mt-0.5" style={{ color: item.color }}>{item.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

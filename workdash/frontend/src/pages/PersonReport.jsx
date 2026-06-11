import { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PROJ_COLORS = ['#1D9E75','#378ADD','#EF9F27','#E24B4A','#7C3AED','#EC4899','#0891B2'];

function fmtLeaveDate(from, to) {
  if (!from) return '—';
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to + 'T00:00:00');
  const opts = { day: '2-digit', month: 'short' };
  if (!to || from === to) return f.toLocaleDateString('en-GB', opts);
  return f.toLocaleDateString('en-GB', opts) + ' – ' + t.toLocaleDateString('en-GB', opts);
}

function LeaveHistory({ requests, year }) {
  const STATUS = {
    approved: { label: 'Approved', bg: '#F0FDF4', color: '#15803D', border: '#BBF7D0' },
    pending:  { label: 'Pending',  bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
    rejected: { label: 'Rejected', bg: '#FEF2F2', color: '#DC2626', border: '#FECACA' },
  };

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="section-title">Leave History · {year}</p>
          <p className="section-sub">{requests.length} request{requests.length !== 1 ? 's' : ''} this year</p>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12" style={{ color: 'var(--text-muted)' }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8, opacity: 0.25 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p className="text-sm font-medium">No leave taken in {year}</p>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Period</th>
                <th>Days</th>
                <th>Reason</th>
                <th>Paid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {requests.map(r => {
                const s = STATUS[r.status] || STATUS.pending;
                const typeColor = r.color || '#1D9E75';
                const days = parseFloat(r.total_days) || 0;
                const isHalf = days < 1;
                return (
                  <tr key={r.request_id}>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
                        background: typeColor + '18', color: typeColor, border: `1px solid ${typeColor}33`,
                        whiteSpace: 'nowrap',
                      }}>
                        {r.type_name || 'Leave'}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                        {fmtLeaveDate(r.from_date, r.to_date)}
                      </span>
                      {isHalf && r.half_day_type && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 5 }}>
                          ({r.half_day_type})
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                        {days % 1 === 0 ? days : days.toFixed(1)}d
                      </span>
                    </td>
                    <td style={{ maxWidth: 240 }}>
                      {r.reason ? (
                        <span
                          style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={r.reason}
                        >
                          {r.reason}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                      {r.status === 'rejected' && r.reject_reason && (
                        <span
                          style={{ fontSize: 10, color: '#DC2626', display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={r.reject_reason}
                        >
                          Rejected: {r.reject_reason}
                        </span>
                      )}
                      {r.status === 'approved' && r.approve_reason && (
                        <span
                          style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                          title={r.approve_reason}
                        >
                          Note: {r.approve_reason}
                        </span>
                      )}
                    </td>
                    <td>
                      {r.paid ? (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#15803D' }}>Paid</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Unpaid</span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5,
                        background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                        whiteSpace: 'nowrap',
                      }}>
                        {s.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

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

const YEAR_HEAT = {
  present: { color: '#1D9E75', label: 'Present'  },
  late:    { color: '#EF9F27', label: 'Late'     },
  absent:  { color: '#E24B4A', label: 'Absent'   },
  leave:   { color: '#8B5CF6', label: 'On Leave' },
  off:     { color: 'var(--border)', label: 'Weekend / Holiday' },
};

function YearAttendanceHeatmap({ days, year, loading }) {
  // GitHub-style grid: columns = weeks, rows = Mon…Sun
  const CELL = 11, GAP = 3;
  const jan1Offset = (new Date(Date.UTC(year, 0, 1)).getUTCDay() + 6) % 7;
  const cells = [];
  const monthLabels = [];
  let lastMonth = -1;
  days.forEach(d => {
    const dt = new Date(`${d.date}T00:00:00Z`);
    const row = (dt.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
    const dayIdx = Math.round((dt - Date.UTC(year, 0, 1)) / 86400000);
    const col = Math.floor((dayIdx + jan1Offset) / 7);
    if (dt.getUTCMonth() !== lastMonth) {
      lastMonth = dt.getUTCMonth();
      monthLabels.push({ col, label: MONTHS[lastMonth] });
    }
    cells.push({ ...d, row, col });
  });
  const totalCols = cells.length ? Math.max(...cells.map(c => c.col)) + 1 : 0;
  const counts = days.reduce((acc, d) => { acc[d.status] = (acc[d.status] || 0) + 1; return acc; }, {});

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 flex-wrap gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="section-title">Attendance Map · {year}</p>
          <p className="section-sub">
            {counts.present || 0} present · {counts.late || 0} late · {counts.absent || 0} absent · {counts.leave || 0} on leave
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries(YEAR_HEAT).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: v.color, display: 'inline-block' }} />
              {v.label}
            </span>
          ))}
        </div>
      </div>
      <div className="p-5" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="skeleton h-24 rounded" />
        ) : cells.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No attendance data for {year}</p>
        ) : (
          <div style={{ minWidth: totalCols * (CELL + GAP) + 30 }}>
            <div style={{ position: 'relative', height: 14, marginLeft: 30 }}>
              {monthLabels.map(m => (
                <span key={m.label} style={{ position: 'absolute', left: m.col * (CELL + GAP), fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>
                  {m.label}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, width: 24 }}>
                {['Mon', '', 'Wed', '', 'Fri', '', ''].map((l, i) => (
                  <span key={i} style={{ fontSize: 9, color: 'var(--text-muted)', height: CELL, lineHeight: `${CELL}px` }}>{l}</span>
                ))}
              </div>
              <div style={{ position: 'relative', height: 7 * (CELL + GAP) - GAP, width: totalCols * (CELL + GAP) - GAP }}>
                {cells.map(c => (
                  <div
                    key={c.date}
                    title={`${c.date} — ${YEAR_HEAT[c.status]?.label || c.status}`}
                    style={{
                      position: 'absolute',
                      left: c.col * (CELL + GAP),
                      top: c.row * (CELL + GAP),
                      width: CELL, height: CELL, borderRadius: 2,
                      background: YEAR_HEAT[c.status]?.color || 'var(--border)',
                      opacity: c.status === 'off' ? 0.45 : 1,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
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
  const [leaveBalance, setLeaveBalance] = useState([]);
  const [yearDays, setYearDays] = useState([]);
  const [yearLoading, setYearLoading] = useState(false);

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

  useEffect(() => {
    if (selectedId) {
      loadReport();
      api.get(`/hr/leave-balance/${selectedId}`)
        .then(res => setLeaveBalance(res.data.leaveBalance || []))
        .catch(() => setLeaveBalance([]));
    }
  }, [selectedId, refreshKey]);

  useEffect(() => {
    if (!selectedId) return;
    setYearLoading(true);
    api.get(`/employees/${selectedId}/year-attendance?year=${year}`)
      .then(res => setYearDays(res.data.days || []))
      .catch(() => setYearDays([]))
      .finally(() => setYearLoading(false));
  }, [selectedId, year, refreshKey]);

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
            {Array.from({ length: new Date().getFullYear() - 2022 }, (_, i) => 2023 + i).map(y => <option key={y}>{y}</option>)}
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
        <>
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
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-[16px] leading-tight">{emp.name}</p>
                    <p className="text-white/70 text-xs mt-0.5">{emp.department}</p>
                    <p className="text-white/50 text-[11px]">{emp.designation}</p>
                  </div>
                  {stats.todayStatus && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                      padding: '3px 8px', borderRadius: 99,
                      background: stats.todayStatus === 'Present' ? 'rgba(29,158,117,0.25)'
                        : stats.todayStatus === 'Late' ? 'rgba(239,159,39,0.3)'
                        : 'rgba(226,75,74,0.3)',
                      color: stats.todayStatus === 'Present' ? '#6EFFD0'
                        : stats.todayStatus === 'Late' ? '#FFD97D'
                        : '#FFAAAA',
                      border: `1px solid ${stats.todayStatus === 'Present' ? 'rgba(110,255,208,0.3)'
                        : stats.todayStatus === 'Late' ? 'rgba(255,217,125,0.3)'
                        : 'rgba(255,170,170,0.3)'}`,
                      whiteSpace: 'nowrap',
                    }}>
                      Today: {stats.todayStatus}
                    </span>
                  )}
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

                {/* Leave Balance */}
                {leaveBalance.length > 0 && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>
                      Leave Balance · This Year
                    </p>
                    <div className="space-y-3">
                      {leaveBalance.map(lb => {
                        const used      = parseFloat(lb.used) || 0;
                        const allocated = parseFloat(lb.allocated) || parseFloat(lb.quota) || 0;
                        const remaining = parseFloat(lb.remaining) || 0;
                        const pct       = allocated > 0 ? Math.min(100, Math.round((used / allocated) * 100)) : 0;
                        const barColor  = lb.color || '#1D9E75';
                        return (
                          <div key={lb.id}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: barColor, flexShrink: 0 }} />
                                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{lb.type_name}</span>
                              </div>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                <strong style={{ color: barColor }}>{used}</strong> / {allocated}d
                              </span>
                            </div>
                            <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', marginBottom: 3 }}>
                              <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${pct}%`, transition: 'width 0.5s ease' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{pct}% used</span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{remaining}d remaining</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <YearAttendanceHeatmap days={yearDays} year={year} loading={yearLoading} />
        <LeaveHistory requests={report.leaveRequests || []} year={year} />
        </>
      ) : null}
    </div>
  );
}

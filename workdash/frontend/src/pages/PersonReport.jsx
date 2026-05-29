import { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function Avatar({ name }) {
  const initials = name ? name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase() : '??';
  return (
    <div className="w-16 h-16 rounded-full bg-[#1D9E75] text-white text-xl font-bold flex items-center justify-center shrink-0">
      {initials}
    </div>
  );
}

function KpiBox({ label, value, color = '#1a1c20' }) {
  return (
    <div className="bg-[var(--color-bg)] rounded-xl p-4 text-center">
      <div className="text-2xl font-bold" style={{ color }}>{value ?? '—'}</div>
      <div className="text-xs text-[var(--color-muted)] mt-1">{label}</div>
    </div>
  );
}

export default function PersonReport() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get('/employees')
      .then(res => {
        setEmployees(res.data.employees || []);
        if (!selectedId && res.data.employees?.length) {
          setSelectedId(String(res.data.employees[0].id));
        }
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
  const emp = report?.employee || {};
  const officeStart = '09:00';

  const dailyData = (report?.dailyHours || []).map(d => ({
    date: new Date(d.date).getDate(),
    hours: d.hours,
    is_late: d.is_late,
  }));

  const projectData = (report?.projectHours || []).map(p => ({
    name: p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name,
    hours: parseFloat(p.hours) || 0,
  }));

  const PROJECT_COLORS = ['#1D9E75', '#378ADD', '#EF9F27', '#E24B4A', '#8b5cf6', '#ec4899'];

  return (
    <div className="fade-in space-y-5">
      {/* Filter Bar */}
      <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Employee</label>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#1D9E75] min-w-48"
          >
            <option value="">Select employee…</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Month</label>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
          >
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Year</label>
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none"
          >
            {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
        <button
          onClick={loadReport}
          className="bg-[#1D9E75] hover:bg-[#0F6E56] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Load Report
        </button>
      </div>

      {!selectedId ? (
        <div className="text-center py-20 text-[var(--color-muted)]">
          <div className="text-4xl mb-3">👤</div>
          <p>Select an employee to view their monthly report.</p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-4">
            <div className="skeleton h-24 rounded-xl" />
            <div className="skeleton h-64 rounded-xl" />
            <div className="skeleton h-48 rounded-xl" />
          </div>
          <div className="lg:col-span-2 skeleton h-96 rounded-xl" />
        </div>
      ) : report ? (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* Left: Charts */}
          <div className="lg:col-span-3 space-y-4">
            {/* KPI boxes */}
            <div className="grid grid-cols-3 gap-3">
              <KpiBox label="Days Present" value={stats.presentDays} color="#1D9E75" />
              <KpiBox label="Late Days" value={stats.lateDays} color="#EF9F27" />
              <KpiBox label="Total Hours" value={`${stats.totalHours}h`} color="#378ADD" />
            </div>

            {/* Daily hours */}
            <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
              <h3 className="font-semibold text-[var(--color-text)] mb-4">Daily Hours — {MONTH_NAMES[month - 1]} {year}</h3>
              {dailyData.length === 0 ? (
                <div className="text-center py-8 text-[var(--color-muted)] text-sm">No hours logged this month</div>
              ) : (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={dailyData}>
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={v => [`${v}h`, 'Hours']} labelFormatter={l => `Day ${l}`} />
                    <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
                      {dailyData.map((d, i) => (
                        <Cell key={i} fill={d.hours < 4 || d.is_late ? '#E24B4A' : '#1D9E75'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Hours by project */}
            <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
              <h3 className="font-semibold text-[var(--color-text)] mb-4">Hours by Project</h3>
              {projectData.length === 0 ? (
                <div className="text-center py-6 text-[var(--color-muted)] text-sm">No project time logged</div>
              ) : (
                <div className="space-y-3">
                  {projectData.map((p, i) => {
                    const max = Math.max(...projectData.map(x => x.hours)) || 1;
                    return (
                      <div key={i}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-[var(--color-text)]">{p.name}</span>
                          <span className="font-semibold" style={{ color: PROJECT_COLORS[i % PROJECT_COLORS.length] }}>{p.hours.toFixed(1)}h</span>
                        </div>
                        <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(p.hours / max) * 100}%`, backgroundColor: PROJECT_COLORS[i % PROJECT_COLORS.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right: Profile card */}
          <div className="lg:col-span-2">
            <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-6 h-full">
              {/* Avatar + info */}
              <div className="flex items-start gap-4 mb-6">
                <Avatar name={emp.name} />
                <div>
                  <div className="font-bold text-[var(--color-text)] text-lg">{emp.name}</div>
                  <div className="text-sm text-[var(--color-muted)]">{emp.department}</div>
                  <div className="text-xs text-[var(--color-muted)] mt-0.5">{emp.designation}</div>
                </div>
              </div>

              {/* Avg times */}
              <div className="grid grid-cols-2 gap-3 mb-5">
                <div className="bg-[var(--color-bg)] rounded-lg p-3">
                  <div className="text-xs text-[var(--color-muted)] mb-1">Avg Clock-In</div>
                  <div className={`font-bold text-base ${stats.avgClockIn > officeStart ? 'text-red-500' : 'text-[var(--color-text)]'}`}>
                    {stats.avgClockIn || '—'}
                  </div>
                </div>
                <div className="bg-[var(--color-bg)] rounded-lg p-3">
                  <div className="text-xs text-[var(--color-muted)] mb-1">Avg Clock-Out</div>
                  <div className="font-bold text-base text-[var(--color-text)]">{stats.avgClockOut || '—'}</div>
                </div>
              </div>

              {/* Attendance % */}
              <div className="mb-5">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-[var(--color-muted)]">Attendance Rate</span>
                  <span className="font-bold text-[#1D9E75]">{stats.attendanceRate}%</span>
                </div>
                <div className="h-2.5 bg-[var(--color-border)] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${stats.attendanceRate}%`, backgroundColor: stats.attendanceRate >= 80 ? '#1D9E75' : '#EF9F27' }}
                  />
                </div>
              </div>

              {/* 2x2 summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-green-600">{stats.presentDays}</div>
                  <div className="text-xs text-green-700 mt-0.5">Present</div>
                </div>
                <div className="bg-amber-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-amber-600">{stats.lateDays}</div>
                  <div className="text-xs text-amber-700 mt-0.5">Late</div>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-red-500">{stats.absentDays}</div>
                  <div className="text-xs text-red-600 mt-0.5">Absent</div>
                </div>
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-blue-500">{stats.leaveDays}</div>
                  <div className="text-xs text-blue-600 mt-0.5">Leave</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

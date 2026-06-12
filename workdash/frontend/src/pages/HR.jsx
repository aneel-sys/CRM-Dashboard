import { useState, useEffect, useRef } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import {
  MdPeople, MdPersonAdd, MdExitToApp, MdSchedule,
  MdSearch, MdWork, MdBeachAccess,
  MdChevronLeft, MdChevronRight,
} from 'react-icons/md';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import api from '../api/axios';

// ─── color maps ────────────────────────────────────────────────────────────

const GENDER_COLORS = { male: '#378ADD', female: '#E24B4A', others: '#8B5CF6' };
const GENDER_LABELS = { male: 'Male', female: 'Female', others: 'Others' };
const EMP_COLORS    = ['#1D9E75', '#378ADD', '#EF9F27', '#8B5CF6', '#E24B4A', '#6B7280'];
const DEPT_COLORS   = ['#1D9E75', '#378ADD', '#EF9F27', '#8B5CF6', '#E24B4A', '#6B7280', '#14B8A6', '#F97316'];

// ─── tiny helpers ──────────────────────────────────────────────────────────

function fmtDate(str) {
  if (!str) return '—';
  return new Date(str + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtShort(str) {
  if (!str) return '—';
  return new Date(str + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function daysFromNow(str) {
  if (!str) return null;
  return Math.ceil((new Date(str + 'T00:00:00') - new Date()) / 86400000);
}

// ─── sub-components ────────────────────────────────────────────────────────

function SectionCard({ title, subtitle, children, action }) {
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="section-title">{title}</p>
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const palette  = ['#1D9E75', '#378ADD', '#EF9F27', '#8B5CF6', '#E24B4A'];
  const color    = palette[(name || '').charCodeAt(0) % palette.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: color + '22', border: `1.5px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: size * 0.35, fontWeight: 700, color }}>{initials}</span>
    </div>
  );
}

function ExpiryBadge({ type }) {
  const styles = {
    notice:    { label: 'Notice',    bg: '#FEF2F2', color: '#E24B4A', border: '#FECACA' },
    probation: { label: 'Probation', bg: '#FFFBEB', color: '#D97706', border: '#FDE68A' },
    contract:  { label: 'Contract',  bg: '#EFF6FF', color: '#3B82F6', border: '#BFDBFE' },
  };
  const s = styles[type] || { label: type || '—', bg: 'var(--bg)', color: 'var(--text-muted)', border: 'var(--border)' };
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
      {s.label}
    </span>
  );
}

function StatusBadge({ emp }) {
  const now = new Date();
  const onNotice    = emp.notice_period_start_date && (!emp.notice_period_end_date || new Date(emp.notice_period_end_date + 'T00:00:00') >= now);
  const onProbation = emp.probation_end_date && new Date(emp.probation_end_date + 'T00:00:00') >= now;
  if (onNotice)    return <span style={{ background: '#FEF2F2', color: '#E24B4A', border: '1px solid #FECACA', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Notice</span>;
  if (onProbation) return <span style={{ background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Probation</span>;
  return <span style={{ background: '#F0FDF4', color: '#1D9E75', border: '1px solid #A7F3D0', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>Active</span>;
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function HR() {
  const { refreshKey } = useOutletContext();
  const navigate       = useNavigate();
  const toast          = useToast();

  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summary,      setSummary]      = useState({ total: 0, newJoiners: 0, onNotice: 0, onProbation: 0 });
  const [headcount,    setHeadcount]    = useState([]);
  const [gender,       setGender]       = useState([]);
  const [empTypes,     setEmpTypes]     = useState([]);
  const [leaveUsage,   setLeaveUsage]   = useState({ employees: [], withLeave: 0 });
  const [leavePeriod,  setLeavePeriod]  = useState('year');
  const [leaveLoading, setLeaveLoading] = useState(false);
  const [departments,  setDepartments]  = useState([]);
  const [joiners,      setJoiners]      = useState([]);
  const [expiring,     setExpiring]     = useState([]);

  const [employees, setEmployees] = useState([]);
  const [empTotal,  setEmpTotal]  = useState(0);
  const [empPage,   setEmpPage]   = useState(1);
  const [empLimit,  setEmpLimit]  = useState(15);
  const [empLoading,setEmpLoading]= useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search,      setSearch]      = useState('');
  const [deptFilter,  setDeptFilter]  = useState('');

  const debounceRef = useRef(null);

  // Load all summary data
  useEffect(() => {
    setSummaryLoading(true);
    Promise.all([
      api.get('/hr/summary'),
      api.get('/hr/headcount'),
      api.get('/hr/gender'),
      api.get('/hr/employment-types'),
      api.get(`/hr/leave-usage?period=${leavePeriod}`),
      api.get('/hr/departments'),
      api.get('/hr/new-joiners'),
      api.get('/hr/expiring'),
    ]).then(([s, h, g, t, l, d, j, e]) => {
      setSummary(s.data);
      setHeadcount(h.data.headcount || []);
      setGender(g.data.gender || []);
      setEmpTypes(t.data.types || []);
      setLeaveUsage({ employees: l.data.employees || [], withLeave: l.data.withLeave || 0 });
      setDepartments(d.data.departments || []);
      setJoiners(j.data.joiners || []);
      setExpiring(e.data.expiring || []);
    }).catch(() => toast('Failed to load HR data'))
      .finally(() => setSummaryLoading(false));
  }, [refreshKey]);

  // Refetch leave usage when the period toggle changes (skip initial mount — covered above)
  const leavePeriodMounted = useRef(false);
  useEffect(() => {
    if (!leavePeriodMounted.current) { leavePeriodMounted.current = true; return; }
    setLeaveLoading(true);
    api.get(`/hr/leave-usage?period=${leavePeriod}`)
      .then(l => setLeaveUsage({ employees: l.data.employees || [], withLeave: l.data.withLeave || 0 }))
      .catch(() => {})
      .finally(() => setLeaveLoading(false));
  }, [leavePeriod]);

  // Debounce search
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput), 300);
  }, [searchInput]);

  // Reset page when filter changes
  useEffect(() => { setEmpPage(1); }, [search, deptFilter]);

  // Fetch employee directory
  useEffect(() => {
    setEmpLoading(true);
    api.get('/hr/employees', { params: { search, dept: deptFilter, page: empPage } })
      .then(res => {
        setEmployees(res.data.employees || []);
        setEmpTotal(res.data.total || 0);
        setEmpLimit(res.data.limit || 15);
      })
      .catch(() => {})
      .finally(() => setEmpLoading(false));
  }, [search, deptFilter, empPage, refreshKey]);

  const genderData = gender.map(g => ({
    name:  GENDER_LABELS[g.gender] || (g.gender ? g.gender.charAt(0).toUpperCase() + g.gender.slice(1) : 'Unknown'),
    value: Number(g.count),
    color: GENDER_COLORS[g.gender] || '#6B7280',
  }));

  const empTypesTotal = empTypes.reduce((s, t) => s + t.count, 0);
  const totalPages    = Math.ceil(empTotal / empLimit);

  return (
    <div className="space-y-5 fade-up">

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { title: 'Total Employees',  icon: MdPeople,    color: '#1D9E75', value: summary.total      ?? '—', sub: 'active headcount' },
          { title: 'New This Month',   icon: MdPersonAdd, color: '#378ADD', value: summary.newJoiners  ?? '—', sub: new Date().toLocaleString('en-GB', { month: 'long' }) + ' joiners' },
          { title: 'On Notice Period', icon: MdExitToApp, color: '#E24B4A', value: summary.onNotice    ?? '—', sub: summary.total ? `of ${summary.total} active employees` : 'serving notice' },
          { title: 'On Probation',     icon: MdSchedule,  color: '#EF9F27', value: summary.onProbation ?? '—', sub: summary.total ? `of ${summary.total} active employees` : 'probation ongoing' },
        ].map(card => (
          <StatCard key={card.title} title={card.title} icon={card.icon} color={card.color} value={card.value} sub={card.sub} loading={summaryLoading} />
        ))}
      </div>

      {/* ── Headcount by Dept + Gender ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        <div className="lg:col-span-3">
          <SectionCard title="Headcount by Department" subtitle="Active employees per team">
            {summaryLoading ? (
              <div className="skeleton rounded" style={{ height: 220 }} />
            ) : headcount.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No department data</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(200, headcount.length * 34)}>
                <BarChart data={headcount} layout="vertical" margin={{ top: 0, right: 28, bottom: 0, left: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="department" tick={{ fontSize: 11, fill: 'var(--text)' }} axisLine={false} tickLine={false} width={Math.min(200, Math.max(100, headcount.reduce((m, d) => Math.max(m, (d.department || '').length), 0) * 7))} />
                  <Tooltip formatter={v => [v, 'Employees']} cursor={{ fill: 'var(--bg)' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={18} label={{ position: 'right', fontSize: 11, fill: 'var(--text-muted)', formatter: v => v }}>
                    {headcount.map((_, i) => <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <SectionCard title="Gender Distribution" subtitle="Active workforce breakdown">
            {summaryLoading ? (
              <div className="skeleton rounded" style={{ height: 220 }} />
            ) : genderData.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No gender data</p>
              </div>
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={genderData} cx="50%" cy="50%" outerRadius={58} dataKey="value" paddingAngle={3}>
                      {genderData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
                  {genderData.map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {d.name} <strong style={{ color: 'var(--text)' }}>{d.value}</strong>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Leave Balance + Employment Types ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        <div className="lg:col-span-3">
          <SectionCard
            title={`Leave Usage · ${leavePeriod === 'month' ? 'This Month' : 'This Year'}`}
            subtitle={leaveUsage.withLeave > 0 ? `${leaveUsage.withLeave} of ${summary.total} employees have taken leave` : 'Leave usage by employee'}
            action={
              <div className="flex items-center gap-1">
                {[['month', 'This Month'], ['year', 'This Year']].map(([val, label]) => (
                  <button key={val} onClick={() => setLeavePeriod(val)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                    style={leavePeriod === val
                      ? { background: 'var(--primary)', color: '#fff' }
                      : { background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                    {label}
                  </button>
                ))}
              </div>
            }
          >
            {(summaryLoading || leaveLoading) ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => <div key={i} className="skeleton rounded-xl" style={{ height: 52 }} />)}
              </div>
            ) : leaveUsage.employees.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <MdBeachAccess size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
                <p className="text-sm">No leave taken yet this year</p>
              </div>
            ) : (
              <div>
                {/* Column headers */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Employee</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'right' }}>Used · Left</span>
                </div>

                <div className="space-y-1">
                  {leaveUsage.employees.map((emp, idx) => {
                    const maxUsed = leaveUsage.employees[0]?.totalUsed || 1;
                    const pct = Math.round((emp.totalUsed / maxUsed) * 100);
                    return (
                      <div key={emp.id}
                        onClick={() => navigate(`/person?id=${emp.id}`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 8px', borderRadius: 10, cursor: 'pointer', transition: 'background 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = ''}
                      >
                        {/* Rank */}
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 16, textAlign: 'center' }}>#{idx + 1}</span>

                        {/* Avatar */}
                        <Avatar name={emp.name} size={34} />

                        {/* Name + dept + leave type pills */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {emp.name}
                          </p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{emp.department || '—'}</span>
                            <span style={{ color: 'var(--border)' }}>·</span>
                            {emp.types.filter(t => t.used > 0).map(t => (
                              <span key={t.type_name} style={{
                                fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                                background: (t.color || '#1D9E75') + '22',
                                color: t.color || '#1D9E75',
                                border: `1px solid ${(t.color || '#1D9E75')}44`,
                              }}>
                                {t.type_name} {t.used}d
                              </span>
                            ))}
                            {emp.types.every(t => t.used === 0) && (
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>no leave taken</span>
                            )}
                          </div>
                          {/* Mini usage bar */}
                          <div style={{ height: 3, borderRadius: 2, background: 'var(--border)', overflow: 'hidden', marginTop: 5 }}>
                            <div style={{ height: '100%', borderRadius: 2, background: 'var(--primary)', width: `${pct}%`, transition: 'width 0.5s ease' }} />
                          </div>
                        </div>

                        {/* Used · Remaining */}
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', margin: 0 }}>{emp.totalUsed.toFixed(1)}d</p>
                          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
                            {emp.totalRemaining != null ? `${emp.totalRemaining.toFixed(0)}d left` : 'this month'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer — remaining count */}
                {leaveUsage.withLeave > leaveUsage.employees.length && (
                  <div style={{
                    marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      +{leaveUsage.withLeave - leaveUsage.employees.length} more employees with leave
                    </span>
                    <button onClick={() => navigate('/reports')} className="btn btn-ghost"
                      style={{ fontSize: 11, color: 'var(--primary)', height: 26, padding: '0 10px' }}>
                      View in Reports →
                    </button>
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <SectionCard title="Employment Types" subtitle="Workforce composition" action={<MdWork size={16} style={{ color: 'var(--text-muted)' }} />}>
            {summaryLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="skeleton rounded" style={{ height: 36 }} />)}
              </div>
            ) : empTypes.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No employment type data</p>
              </div>
            ) : (
              <div className="space-y-3">
                {empTypes.map((t, i) => {
                  const pct   = empTypesTotal > 0 ? Math.round((t.count / empTypesTotal) * 100) : 0;
                  const color = EMP_COLORS[i % EMP_COLORS.length];
                  const label = t.type ? (t.type.charAt(0).toUpperCase() + t.type.slice(1)) : '—';
                  return (
                    <div key={t.type}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 12, fontWeight: 700, color }}>{t.count}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 28, textAlign: 'right' }}>{pct}%</span>
                        </div>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, background: color, width: `${pct}%`, transition: 'width 0.6s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      {/* ── Employee Directory ─────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <p className="section-title">Employee Directory</p>
            <p className="section-sub">{empTotal} active employees</p>
          </div>
          <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <MdSearch size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search name or email…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                style={{
                  height: 32, paddingLeft: 28, paddingRight: 10, fontSize: 12,
                  border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--bg)', color: 'var(--text)', outline: 'none', width: 210,
                }}
              />
            </div>
            <select
              value={deptFilter}
              onChange={e => setDeptFilter(e.target.value)}
              style={{
                height: 32, padding: '0 10px', fontSize: 12, cursor: 'pointer',
                border: '1px solid var(--border)', borderRadius: 8,
                background: 'var(--bg)', color: 'var(--text)',
              }}
            >
              <option value="">All Departments</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          {empLoading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton rounded" style={{ height: 44 }} />)}
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
              <MdPeople size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
              <p className="text-sm">{search || deptFilter ? 'No matching employees' : 'No employees found'}</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Joined</th>
                  <th>Type</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {employees.map(emp => (
                  <tr key={emp.id}
                    onClick={() => navigate(`/person?id=${emp.id}`)}
                    style={{ cursor: 'pointer' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={emp.name} size={30} />
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)', margin: 0 }}>{emp.name}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{emp.email}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{emp.department || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{emp.designation || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDate(emp.joining_date)}</td>
                    <td>
                      {emp.employment_type
                        ? <span style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 7px', fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
                            {emp.employment_type}
                          </span>
                        : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      }
                    </td>
                    <td><StatusBadge emp={emp} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {(empPage - 1) * empLimit + 1}–{Math.min(empPage * empLimit, empTotal)} of {empTotal} employees
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setEmpPage(p => Math.max(1, p - 1))} disabled={empPage === 1}
                className="btn btn-ghost"
                style={{ height: 30, width: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: empPage === 1 ? 0.4 : 1 }}>
                <MdChevronLeft size={18} />
              </button>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{empPage} / {totalPages}</span>
              <button onClick={() => setEmpPage(p => Math.min(totalPages, p + 1))} disabled={empPage === totalPages}
                className="btn btn-ghost"
                style={{ height: 30, width: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: empPage === totalPages ? 0.4 : 1 }}>
                <MdChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── New Joiners + Expiring ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        <div className="lg:col-span-2">
          <SectionCard
            title="New Joiners"
            subtitle="Last 30 days"
            action={
              <span style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                {joiners.length}
              </span>
            }
          >
            {summaryLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="skeleton rounded" style={{ height: 42 }} />)}
              </div>
            ) : joiners.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <MdPersonAdd size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
                <p className="text-sm">No new joiners in the last 30 days</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {joiners.map(j => (
                  <div key={j.id}
                    onClick={() => navigate(`/person?id=${j.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 8, padding: '6px 8px', margin: '0 -8px' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <Avatar name={j.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{j.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{j.department || j.designation || '—'}</p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)', flexShrink: 0 }}>
                      {fmtShort(j.joining_date)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-3">
          <SectionCard
            title="Action Required · Next 30 Days"
            subtitle="Probation, contracts & notice periods expiring"
            action={
              expiring.length > 0 ? (
                <span style={{ background: '#FEF2F2', color: '#E24B4A', border: '1px solid #FECACA', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>
                  {expiring.length} pending
                </span>
              ) : null
            }
          >
            {summaryLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <div key={i} className="skeleton rounded" style={{ height: 42 }} />)}
              </div>
            ) : expiring.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px' }}>
                  <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
                </svg>
                <p className="text-sm font-medium">Nothing expiring in the next 30 days</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Employee</th><th>Department</th><th>Type</th><th>Expires</th><th>Days</th></tr>
                </thead>
                <tbody>
                  {expiring.map(e => {
                    const expiryDate = e.expiry_type === 'notice'    ? e.notice_period_end_date
                                     : e.expiry_type === 'probation' ? e.probation_end_date
                                     : e.contract_end_date;
                    const days = daysFromNow(expiryDate);
                    return (
                      <tr key={e.id}
                        onClick={() => navigate(`/person?id=${e.id}`)}
                        style={{ cursor: 'pointer' }}
                        onMouseEnter={ev => ev.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={ev => ev.currentTarget.style.background = ''}
                      >
                        <td>
                          <div className="flex items-center gap-2">
                            <Avatar name={e.name} size={26} />
                            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{e.name}</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{e.department || '—'}</td>
                        <td><ExpiryBadge type={e.expiry_type} /></td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{fmtDate(expiryDate)}</td>
                        <td>
                          <span style={{
                            fontSize: 12, fontWeight: 700,
                            color: days !== null && days <= 7 ? '#E24B4A' : days !== null && days <= 14 ? '#EF9F27' : '#1D9E75',
                          }}>
                            {days !== null ? `${days}d` : '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

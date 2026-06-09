import { useState, useEffect, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import {
  MdFolderOpen, MdCheckCircle, MdAccessTime, MdPeople, MdFilterList,
  MdSearch, MdClose,
} from 'react-icons/md';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── status colors from project_status_settings ──────────────────────────────
const STATUS_COLORS = {
  'in progress': '#00b5ff',
  'not started': '#816e80',
  'on hold':     '#f5c308',
  'canceled':    '#d21010',
  'finished':    '#879c0d',
};

const PRIORITY_COLORS = { high: '#E24B4A', medium: '#EF9F27', low: '#1D9E75' };
const CHART_COLORS    = ['#1D9E75', '#378ADD', '#EF9F27', '#8B5CF6', '#E24B4A'];

const ACTIVITY_MAP = {
  'messages.addedAsNewProject':      'Project created',
  'messages.newTaskAddedToProject':  'New task added',
  'messages.updateSuccess':          'Project updated',
  'messages.memberAdded':            'Member added',
  'messages.taskCompleted':          'Task completed',
  'messages.taskUpdated':            'Task updated',
  'messages.taskDeleted':            'Task deleted',
  'messages.commentAdded':           'Comment added',
  'messages.fileUploaded':           'File uploaded',
  'messages.milestoneAdded':         'Milestone added',
  'messages.milestoneCompleted':     'Milestone completed',
};

function parseActivity(text) {
  if (!text) return 'Activity recorded';
  if (text.startsWith('messages.')) {
    return ACTIVITY_MAP[text]
      || text.replace('messages.', '').replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
  }
  return text.length > 72 ? text.slice(0, 69) + '…' : text;
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function Avatar({ name, size = 32 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const color = CHART_COLORS[(name || '').charCodeAt(0) % CHART_COLORS.length];
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

export default function ProjectDashboard() {
  const { refreshKey } = useOutletContext();
  const navigate       = useNavigate();
  const toast          = useToast();

  const now = new Date();
  const [period,       setPeriod]       = useState('all');   // 'all' | 'month' | 'week'
  const [month,        setMonth]        = useState(now.getMonth() + 1);
  const [year,         setYear]         = useState(now.getFullYear());

  const [loading,        setLoading]        = useState(true);
  const [activityModal,  setActivityModal]  = useState(false);
  const [stats,        setStats]        = useState(null);
  const [projects,     setProjects]     = useState([]);
  const [hoursChart,   setHoursChart]   = useState([]);
  const [taskPriority, setTaskPriority] = useState([]);
  const [contributors, setContributors] = useState([]);
  const [activity,     setActivity]     = useState([]);

  const periodParams = period === 'month'
    ? { period: 'month', month, year }
    : period === 'week'
    ? { period: 'week' }
    : { period: 'all' };

  const periodLabel = period === 'month'
    ? `${MONTHS[month - 1]} ${year}`
    : period === 'week'
    ? 'Last 7 Days'
    : 'All Time';

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/projects/dashboard-stats', { params: periodParams }),
      api.get('/projects'),
      api.get('/projects/hours-chart',     { params: periodParams }),
      api.get('/projects/task-priority'),
      api.get('/projects/top-contributors'),
      api.get('/projects/recent-activity'),
    ]).then(([s, p, h, tp, c, a]) => {
      setStats(s.data);
      setProjects(p.data.projects || []);
      setHoursChart(h.data.data || []);
      setTaskPriority(tp.data.data || []);
      setContributors(c.data.data || []);
      setActivity(a.data.data || []);
    }).catch(() => toast('Failed to load project dashboard'))
      .finally(() => setLoading(false));
  }, [refreshKey, period, month, year]);

  const maxHours         = contributors[0]?.hours || 1;
  const priorityData     = taskPriority.map(t => ({
    name:  t.priority ? t.priority.charAt(0).toUpperCase() + t.priority.slice(1) : 'Unknown',
    value: t.count,
    color: PRIORITY_COLORS[t.priority] || '#6B7280',
  }));

  return (
    <div className="space-y-5 fade-up">

      {/* ── Period Filter ──────────────────────────────────────────────── */}
      <div className="card px-5 py-3 flex flex-wrap items-center gap-3">
        <MdFilterList size={15} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Period:</span>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', borderRadius: 8, padding: 3 }}>
          {[['all', 'All Time'], ['month', 'Month'], ['week', 'This Week']].map(([val, label]) => (
            <button key={val} onClick={() => setPeriod(val)}
              style={{
                padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                background: period === val ? 'var(--primary)' : 'transparent',
                color: period === val ? '#fff' : 'var(--text-muted)',
                transition: 'all 0.15s',
              }}>
              {label}
            </button>
          ))}
        </div>
        {period === 'month' && (
          <>
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="form-input form-select" style={{ height: 32, fontSize: 12, paddingRight: 28 }}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="form-input form-select" style={{ height: 32, fontSize: 12, paddingRight: 28 }}>
              {Array.from({ length: new Date().getFullYear() - 2022 }, (_, i) => 2023 + i).map(y => <option key={y}>{y}</option>)}
            </select>
          </>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
          Showing: {periodLabel}
        </span>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Projects"  icon={MdFolderOpen}  color="#1D9E75"
          value={loading ? '—' : (stats?.totalProjects ?? '—')}
          sub="active · all in progress"
          loading={loading} />
        <StatCard title="Tasks Completed" icon={MdCheckCircle} color="#378ADD"
          value={loading ? '—' : `${stats?.taskCompletion?.pct ?? 0}%`}
          sub={loading ? '' : `${stats?.taskCompletion?.done ?? 0} done · ${(stats?.taskCompletion?.total ?? 0) - (stats?.taskCompletion?.done ?? 0)} remaining`}
          loading={loading} />
        <StatCard title="Hours Logged" icon={MdAccessTime} color="#EF9F27"
          value={loading ? '—' : `${Number(stats?.totalHours ?? 0).toLocaleString()}h`}
          sub={loading ? '' : periodLabel}
          loading={loading} />
        <StatCard title="Team on Projects" icon={MdPeople} color="#8B5CF6"
          value={loading ? '—' : (stats?.activeMembers ?? '—')}
          sub={loading ? '' : `members across ${stats?.totalProjects ?? 0} projects`}
          loading={loading} />
      </div>

      {/* ── Project Cards ──────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <p className="section-title">All Projects</p>
          <p className="section-sub">{projects.length} projects · click any card to view details</p>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton rounded-xl" style={{ height: 148 }} />
            ))
          ) : projects.map(proj => {
            const statusColor = STATUS_COLORS[(proj.status || '').toLowerCase()] || '#6B7280';
            const taskPct     = proj.total_tasks > 0
              ? Math.round((proj.completed_tasks / proj.total_tasks) * 100) : 0;
            const barColor    = taskPct >= 80 ? '#1D9E75' : taskPct >= 40 ? '#EF9F27' : '#E24B4A';
            return (
              <div
                key={proj.id}
                onClick={() => navigate('/projects')}
                style={{
                  border: '1px solid var(--border)', borderRadius: 12, padding: 16,
                  cursor: 'pointer', transition: 'all 0.15s', background: 'var(--card)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = statusColor + '77';
                  e.currentTarget.style.boxShadow   = `0 4px 18px ${statusColor}18`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.boxShadow   = '';
                }}
              >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {proj.name}
                    </p>
                    {proj.short_code && (
                      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{proj.short_code}</p>
                    )}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                    flexShrink: 0, marginLeft: 8, textTransform: 'capitalize',
                    background: statusColor + '18', color: statusColor, border: `1px solid ${statusColor}44`,
                  }}>
                    {proj.status || 'unknown'}
                  </span>
                </div>

                {/* Client */}
                {proj.client_name && (
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>{proj.client_name}</p>
                )}

                {/* Task progress */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Task Progress</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: barColor }}>
                      {proj.completed_tasks}/{proj.total_tasks}
                    </span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: barColor, width: `${taskPct}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>

                {/* Footer */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text)' }}>{parseFloat(proj.hours_logged || 0).toFixed(1)}h</strong> logged
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <strong style={{ color: 'var(--text)' }}>{proj.member_count}</strong> members
                  </span>
                  {proj.is_stale && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#EF9F27', background: '#EF9F2718', border: '1px solid #EF9F2744', borderRadius: 4, padding: '1px 6px' }}>
                      Stale
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Charts Row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        <div className="lg:col-span-3">
          <SectionCard title="Hours by Project" subtitle={`${periodLabel} · hours logged per project`}>
            {loading ? (
              <div className="skeleton rounded" style={{ height: 200 }} />
            ) : hoursChart.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No hours logged yet</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, hoursChart.length * 44)}>
                <BarChart data={hoursChart} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--text)' }} axisLine={false} tickLine={false} width={130} />
                  <Tooltip formatter={v => [`${v}h`, 'Hours']} cursor={{ fill: 'var(--bg)' }} />
                  <Bar dataKey="hours" radius={[0, 4, 4, 0]} maxBarSize={20}
                    label={{ position: 'right', fontSize: 11, fill: 'var(--text-muted)', formatter: v => `${v}h` }}>
                    {hoursChart.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        <div className="lg:col-span-2">
          <SectionCard title="Task Priority Mix" subtitle="Distribution across all tasks">
            {loading ? (
              <div className="skeleton rounded" style={{ height: 200 }} />
            ) : priorityData.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No tasks found</p>
              </div>
            ) : (
              <div>
                <ResponsiveContainer width="100%" height={150}>
                  <PieChart>
                    <Pie data={priorityData} cx="50%" cy="50%" outerRadius={58} dataKey="value" paddingAngle={3}>
                      {priorityData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                  {priorityData.map((d, i) => (
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

      {/* ── Bottom Row: Contributors + Activity ────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <SectionCard title="Top Contributors" subtitle="By total hours logged to projects">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="skeleton rounded" style={{ height: 40 }} />)}
            </div>
          ) : contributors.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">No time logs found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {contributors.map((c, idx) => {
                const pct   = Math.round((c.hours / maxHours) * 100);
                const color = CHART_COLORS[idx % CHART_COLORS.length];
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 18, textAlign: 'center' }}>#{idx + 1}</span>
                    <Avatar name={c.name} size={30} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.name}
                        </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color, flexShrink: 0, marginLeft: 8 }}>{c.hours}h</span>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, background: color, width: `${pct}%`, transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, minWidth: 52, textAlign: 'right' }}>
                      {c.projects} project{c.projects !== 1 ? 's' : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Recent Activity"
          subtitle={`Latest events across all projects · ${activity.length} total`}
          action={
            activity.length > 4 ? (
              <button onClick={() => setActivityModal(true)} className="btn btn-ghost"
                style={{ fontSize: 11, color: 'var(--primary)', height: 28, padding: '0 10px' }}>
                View All ({activity.length}) →
              </button>
            ) : null
          }
        >
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="skeleton rounded" style={{ height: 36 }} />)}
            </div>
          ) : activity.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">No activity recorded yet</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {activity.slice(0, 4).map(a => (
                <ActivityRow key={a.id} a={a} />
              ))}
              {activity.length > 4 && (
                <div style={{ paddingTop: 10, borderTop: '1px solid var(--border)', marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    +{activity.length - 4} more events
                  </span>
                  <button onClick={() => setActivityModal(true)} className="btn btn-ghost"
                    style={{ fontSize: 11, color: 'var(--primary)', height: 26, padding: '0 10px' }}>
                    View All →
                  </button>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Activity Modal ─────────────────────────────────────────────── */}
      {activityModal && (
        <ActivityModal activity={activity} onClose={() => setActivityModal(false)} />
      )}

    </div>
  );
}

function ActivityRow({ a }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 4px', borderRadius: 8 }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 5 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{parseActivity(a.activity)}</p>
        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0' }}>{a.project_name}</p>
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</span>
    </div>
  );
}

function getActivityType(text) {
  if (!text) return 'other';
  if (text.includes('added as a project member') || text.toLowerCase().includes('memberadded') || text === 'messages.memberAdded') return 'member';
  if (text.includes('messages.newTask') || text.includes('Task Added')) return 'task';
  if (text.includes('messages.updateSuccess') || text.includes('Project updated')) return 'update';
  if (text.includes('messages.addedAsNewProject') || text.includes('Project created')) return 'created';
  if (text.includes('timer') || text.includes('Timer')) return 'timer';
  return 'other';
}

const TYPE_LABELS = { member: 'Member', task: 'Task', update: 'Update', created: 'Created', timer: 'Timer', other: 'Other' };
const TYPE_COLORS = { member: '#378ADD', task: '#1D9E75', update: '#EF9F27', created: '#8B5CF6', timer: '#6B7280', other: '#6B7280' };

function groupByDate(items) {
  const groups = {};
  items.forEach(a => {
    const diff = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 86400000);
    const label = diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : diff < 7 ? `${diff} days ago` : diff < 30 ? `${Math.floor(diff / 7)} week${Math.floor(diff / 7) > 1 ? 's' : ''} ago` : `${Math.floor(diff / 30)} month${Math.floor(diff / 30) > 1 ? 's' : ''} ago`;
    if (!groups[label]) groups[label] = [];
    groups[label].push(a);
  });
  return groups;
}

function ActivityModal({ activity, onClose }) {
  const [search,      setSearch]      = useState('');
  const [projFilter,  setProjFilter]  = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');

  const projects = useMemo(() => [...new Set(activity.map(a => a.project_name))].sort(), [activity]);

  const filtered = useMemo(() => activity.filter(a => {
    const text = parseActivity(a.activity).toLowerCase();
    if (search && !text.includes(search.toLowerCase()) && !a.project_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (projFilter && a.project_name !== projFilter) return false;
    if (typeFilter && getActivityType(a.activity) !== typeFilter) return false;
    return true;
  }), [activity, search, projFilter, typeFilter]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--card)', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.35)' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: 0 }}>All Project Activity</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
              {filtered.length} of {activity.length} events
              {(search || projFilter || typeFilter) ? ' · filtered' : ''}
            </p>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <MdClose size={16} />
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
            <MdSearch size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text" placeholder="Search activity or project…" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', height: 34, paddingLeft: 28, paddingRight: 10, fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}>
                <MdClose size={13} />
              </button>
            )}
          </div>
          {/* Project filter */}
          <select value={projFilter} onChange={e => setProjFilter(e.target.value)}
            style={{ height: 34, padding: '0 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', minWidth: 130 }}>
            <option value="">All Projects</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            style={{ height: 34, padding: '0 10px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', cursor: 'pointer', minWidth: 120 }}>
            <option value="">All Types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {/* Active filter pills */}
          {(search || projFilter || typeFilter) && (
            <button onClick={() => { setSearch(''); setProjFilter(''); setTypeFilter(''); }}
              style={{ height: 34, padding: '0 12px', fontSize: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--danger, #E24B4A)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Clear filters
            </button>
          )}
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: '8px 24px 20px', flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: 14 }}>No matching activity found</p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                {/* Date group header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 6px', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1, paddingTop: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{dateLabel}</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{items.length}</span>
                </div>
                {items.map(a => {
                  const type  = getActivityType(a.activity);
                  const color = TYPE_COLORS[type];
                  return (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 8px', borderRadius: 8, margin: '0 -8px' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0, marginTop: 5 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{parseActivity(a.activity)}</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 4, background: color + '18', color, border: `1px solid ${color}33` }}>
                            {TYPE_LABELS[type]}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.project_name}</span>
                        </div>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{timeAgo(a.created_at)}</span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

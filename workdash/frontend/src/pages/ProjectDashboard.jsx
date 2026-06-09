import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts';
import {
  MdFolderOpen, MdCheckCircle, MdAccessTime, MdPeople,
} from 'react-icons/md';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import api from '../api/axios';

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

  const [loading,      setLoading]      = useState(true);
  const [stats,        setStats]        = useState(null);
  const [projects,     setProjects]     = useState([]);
  const [hoursChart,   setHoursChart]   = useState([]);
  const [taskPriority, setTaskPriority] = useState([]);
  const [contributors, setContributors] = useState([]);
  const [activity,     setActivity]     = useState([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get('/projects/dashboard-stats'),
      api.get('/projects'),
      api.get('/projects/hours-chart'),
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
  }, [refreshKey]);

  const maxHours         = contributors[0]?.hours || 1;
  const priorityData     = taskPriority.map(t => ({
    name:  t.priority ? t.priority.charAt(0).toUpperCase() + t.priority.slice(1) : 'Unknown',
    value: t.count,
    color: PRIORITY_COLORS[t.priority] || '#6B7280',
  }));

  return (
    <div className="space-y-5 fade-up">

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Projects"    icon={MdFolderOpen}   color="#1D9E75"
          value={loading ? '—' : (stats?.totalProjects ?? '—')}
          sub="in system" loading={loading} />
        <StatCard title="Tasks Completed"   icon={MdCheckCircle}  color="#378ADD"
          value={loading ? '—' : `${stats?.taskCompletion?.pct ?? 0}%`}
          sub={loading ? '' : `${stats?.taskCompletion?.done ?? 0} / ${stats?.taskCompletion?.total ?? 0} tasks`}
          loading={loading} />
        <StatCard title="Hours Logged"      icon={MdAccessTime}   color="#EF9F27"
          value={loading ? '—' : `${stats?.totalHours ?? 0}h`}
          sub="across all projects" loading={loading} />
        <StatCard title="Active Members"    icon={MdPeople}       color="#8B5CF6"
          value={loading ? '—' : (stats?.activeMembers ?? '—')}
          sub="assigned to projects" loading={loading} />
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
          <SectionCard title="Hours by Project" subtitle="All-time logged hours per project">
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

        <SectionCard title="Recent Activity" subtitle="Latest events across all projects">
          {loading ? (
            <div className="space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="skeleton rounded" style={{ height: 36 }} />)}
            </div>
          ) : activity.length === 0 ? (
            <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">No activity recorded yet</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {activity.map(a => (
                <div key={a.id}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 8px', borderRadius: 8, margin: '0 -8px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)', margin: 0 }}>{parseActivity(a.activity)}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '1px 0 0' }}>{a.project_name}</p>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

    </div>
  );
}

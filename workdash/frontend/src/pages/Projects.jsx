import { useState, useEffect } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  MdArrowBack, MdPeople, MdSchedule, MdFolderOpen, MdAttachMoney,
} from 'react-icons/md';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Treemap } from 'recharts';
import DataTable from '../components/DataTable';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusPill({ status }) {
  const s = (status || '').toLowerCase();
  const map = {
    'active':       { cls: 'pill pill-green',  label: 'Active' },
    'in progress':  { cls: 'pill pill-green',  label: 'In Progress' },
    'completed':    { cls: 'pill pill-blue',   label: 'Completed' },
    'on_hold':      { cls: 'pill pill-amber',  label: 'On Hold' },
    'on hold':      { cls: 'pill pill-amber',  label: 'On Hold' },
    'paused':       { cls: 'pill pill-amber',  label: 'Paused' },
    'cancelled':    { cls: 'pill pill-red',    label: 'Cancelled' },
    'canceled':     { cls: 'pill pill-red',    label: 'Cancelled' },
  };
  const cfg = map[s] || { cls: 'pill pill-gray', label: status || 'Unknown' };
  return <span className={cfg.cls}>{cfg.label}</span>;
}

function PriorityPill({ priority }) {
  const p = (priority || '').toLowerCase();
  const map = {
    high:   { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', label: 'High' },
    medium: { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', label: 'Medium' },
    low:    { bg: '#F0FDF4', color: '#16A34A', border: '#BBF7D0', label: 'Low' },
  };
  const cfg = map[p] || { bg: 'var(--bg)', color: 'var(--text-muted)', border: 'var(--border)', label: priority || '—' };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
      background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    }}>
      {cfg.label}
    </span>
  );
}

function Avatar({ name, size = 26 }) {
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

function KpiCard({ label, value, sub, color = 'var(--primary)' }) {
  return (
    <div className="card p-4 text-center">
      <p className="text-xl font-bold leading-none mb-1" style={{ color }}>{value ?? '—'}</p>
      <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{label}</p>
      {sub && <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
    </div>
  );
}

function ProjectCard({ project, onClick }) {
  const pct = project.completion_pct || 0;
  const dr = project.days_remaining;
  const isOverdue = dr !== null && dr < 0 &&
    !['completed', 'canceled', 'cancelled'].includes((project.status || '').toLowerCase());

  return (
    <div
      onClick={() => onClick(project)}
      className="card p-5 cursor-pointer fade-up"
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--card-shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
      style={{ transition: 'box-shadow 0.15s, transform 0.15s' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            {project.short_code && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                background: 'var(--primary-light)', color: 'var(--primary-dark)', fontFamily: 'monospace',
              }}>
                {project.short_code}
              </span>
            )}
            <p className="font-semibold text-[14px] leading-snug" style={{ color: 'var(--text)' }}>{project.name}</p>
          </div>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {[project.client_name, project.pm_name ? `PM: ${project.pm_name}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {project.is_stale && (
            <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 999, background: '#FEF3C7', color: '#D97706', border: '1px solid #FDE68A' }}>
              Stale
            </span>
          )}
          <StatusPill status={project.status} />
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <MdPeople size={13} /> {project.member_count} members
        </span>
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <MdSchedule size={13} /> {parseFloat(project.hours_logged || 0).toFixed(1)}h
          {project.hours_allocated > 0 ? `/${project.hours_allocated}h` : ''}
        </span>
        {project.budget > 0 && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <MdAttachMoney size={13} /> {Number(project.budget).toLocaleString()}
          </span>
        )}
      </div>

      {/* Dates + countdown */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {project.start_date ? fmtDate(project.start_date) : '—'}
          {project.deadline ? ` → ${fmtDate(project.deadline)}` : ''}
        </span>
        {dr !== null && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, whiteSpace: 'nowrap',
            background: isOverdue ? '#FEF2F2' : '#F0FDF4',
            color: isOverdue ? '#DC2626' : '#16A34A',
            border: `1px solid ${isOverdue ? '#FECACA' : '#BBF7D0'}`,
          }}>
            {isOverdue ? `${Math.abs(dr)}d overdue` : dr === 0 ? 'Due today' : `${dr}d left`}
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span style={{ color: 'var(--text-muted)' }}>{project.completed_tasks}/{project.total_tasks} tasks</span>
          <span className="font-bold" style={{ color: pct >= 75 ? 'var(--primary)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)' }}>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: pct >= 75 ? 'var(--primary)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)' }} />
        </div>
      </div>
    </div>
  );
}

function ProjectDetail({ project, onBack }) {
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [taskFilter, setTaskFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/projects/${project.id}/members?month=${month}&year=${year}`),
      api.get(`/projects/${project.id}/tasks`),
    ]).then(([mRes, tRes]) => {
      setMembers(mRes.data.members || []);
      setTasks(tRes.data.tasks || []);
    }).catch(err => toast(err.response?.data?.message || 'Failed to load project'))
      .finally(() => setLoading(false));
  }, [project.id, month, year]);

  // Timeline
  const startDate = project.start_date ? new Date(project.start_date) : new Date(project.created_at);
  const deadline = project.deadline ? new Date(project.deadline) : null;
  const totalDays = deadline ? Math.max(1, Math.ceil((deadline - startDate) / 86400000)) : 0;
  const elapsedDays = Math.ceil((now - startDate) / 86400000);
  const timelinePct = totalDays > 0 ? Math.max(0, Math.min(100, Math.round((elapsedDays / totalDays) * 100))) : 0;
  const dr = project.days_remaining;
  const isOverdue = dr !== null && dr < 0;

  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const pct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : (project.worksuite_pct || 0);
  const totalHoursLogged = members.reduce((s, m) => s + (parseFloat(m.total_hours) || 0), 0);
  const monthlyHoursTotal = members.reduce((s, m) => s + (parseFloat(m.hours) || 0), 0);

  const chartData = members
    .filter(m => m.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .map(m => ({ name: m.name.split(' ')[0], hours: parseFloat(m.hours) }));

  const filteredTasks = tasks.filter(t =>
    taskFilter === 'all' || t.status === taskFilter
  );

  const MEMBER_COLS = [
    {
      key: 'name', label: 'Member',
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
      render: v => <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span>,
    },
    {
      key: 'designation', label: 'Role',
      render: v => <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{v || '—'}</span>,
    },
    {
      key: 'hourly_rate', label: 'Rate',
      render: v => v > 0
        ? <span className="font-semibold text-sm" style={{ color: 'var(--text)' }}>${parseFloat(v).toFixed(0)}/hr</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      key: 'hours', label: `${MONTHS[month - 1]} Hours`,
      render: v => (
        <span className="font-bold text-sm" style={{ color: v > 0 ? 'var(--primary)' : 'var(--text-muted)' }}>
          {parseFloat(v || 0).toFixed(1)}h
        </span>
      ),
    },
    {
      key: 'total_hours', label: 'All Time',
      render: v => (
        <span className="font-bold text-sm" style={{ color: v > 0 ? 'var(--info)' : 'var(--text-muted)' }}>
          {parseFloat(v || 0).toFixed(1)}h
        </span>
      ),
    },
    {
      key: 'joined_at', label: 'Member Since',
      render: v => <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtDate(v)}</span>,
    },
  ];

  const TASK_COLS = [
    {
      key: 'priority', label: 'Priority',
      render: v => <PriorityPill priority={v} />,
    },
    {
      key: 'title', label: 'Task',
      render: (v, row) => (
        <div>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{v}</p>
          {row.description && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.description}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'assignees', label: 'Assignees',
      render: v => !v?.length
        ? <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Unassigned</span>
        : (
          <div className="flex flex-wrap gap-1">
            {v.map(a => (
              <div key={a.id} className="flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{ background: 'var(--primary-light)', fontSize: 11 }}>
                <Avatar name={a.name} size={16} />
                <span style={{ color: 'var(--primary-dark)', fontWeight: 600 }}>{a.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        ),
    },
    {
      key: 'status', label: 'Status',
      render: v => (
        <span className={`pill ${v === 'completed' ? 'pill-green' : 'pill-gray'}`}>
          {v === 'completed' ? 'Done' : 'Open'}
        </span>
      ),
    },
    {
      key: 'due_date', label: 'Due Date',
      render: v => {
        if (!v) return <span style={{ color: 'var(--text-muted)' }}>—</span>;
        const isLate = new Date(v) < now;
        return (
          <span className="text-xs font-medium" style={{ color: isLate ? 'var(--danger)' : 'var(--text-secondary)' }}>
            {fmtDate(v)}{isLate ? ' (overdue)' : ''}
          </span>
        );
      },
    },
    {
      key: 'estimate_label', label: 'Estimate',
      render: v => <span className="text-xs" style={{ color: v ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{v || '—'}</span>,
    },
  ];

  return (
    <div className="space-y-5 fade-up">

      {/* Header */}
      <div className="flex items-start gap-4">
        <button onClick={onBack} className="btn btn-secondary gap-1.5 shrink-0 mt-1">
          <MdArrowBack size={16} /> Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
            {project.short_code && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5,
                background: 'var(--primary-light)', color: 'var(--primary-dark)', fontFamily: 'monospace',
              }}>
                {project.short_code}
              </span>
            )}
            <h2 className="font-bold text-lg leading-tight" style={{ color: 'var(--text)' }}>{project.name}</h2>
            <StatusPill status={project.status} />
            {isOverdue && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA' }}>
                {Math.abs(dr)}d overdue
              </span>
            )}
            {!isOverdue && dr !== null && dr <= 7 && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A' }}>
                {dr === 0 ? 'Due today' : `${dr}d left`}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            {project.client_name && (
              <span>Client: <b style={{ color: 'var(--text-secondary)' }}>{project.client_name}</b></span>
            )}
            {project.pm_name && (
              <span>Project Manager: <b style={{ color: 'var(--text-secondary)' }}>{project.pm_name}</b></span>
            )}
            {project.start_date && (
              <span>Started: <b style={{ color: 'var(--text-secondary)' }}>{fmtDate(project.start_date)}</b></span>
            )}
            {project.deadline && (
              <span>Deadline: <b style={{ color: isOverdue ? 'var(--danger)' : 'var(--text-secondary)' }}>{fmtDate(project.deadline)}</b></span>
            )}
          </div>
        </div>
      </div>

      {/* Timeline bar */}
      {deadline && (
        <div className="card px-5 py-4">
          <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            <span>{fmtDate(project.start_date || project.created_at)}</span>
            <span className="font-semibold" style={{ color: isOverdue ? 'var(--danger)' : 'var(--text)' }}>
              {timelinePct}% elapsed{isOverdue ? ' · overdue' : ''}
            </span>
            <span>{fmtDate(project.deadline)}</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all" style={{
              width: `${timelinePct}%`,
              background: isOverdue ? 'var(--danger)' : timelinePct > 80 ? 'var(--warning)' : 'var(--primary)',
            }} />
          </div>
          <div className="flex justify-between text-[10px] mt-1.5" style={{ color: 'var(--text-muted)' }}>
            <span>Start</span>
            <span>Today · {Math.max(0, elapsedDays)}/{totalDays} days</span>
            <span>Deadline</span>
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Budget"
          value={project.budget > 0 ? `$${Number(project.budget).toLocaleString()}` : 'N/A'}
          color="var(--info)"
        />
        <KpiCard
          label="Hours Allocated"
          value={project.hours_allocated > 0 ? `${project.hours_allocated}h` : 'N/A'}
          sub="project budget"
          color="var(--text-secondary)"
        />
        <KpiCard
          label="Hours Logged"
          value={`${totalHoursLogged.toFixed(1)}h`}
          sub="all time total"
          color="var(--primary)"
        />
        <KpiCard
          label="Tasks"
          value={`${completedCount}/${tasks.length}`}
          sub="done / total"
          color="var(--warning)"
        />
        <KpiCard
          label="Completion"
          value={`${pct}%`}
          sub="by task count"
          color={pct >= 75 ? 'var(--primary)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)'}
        />
        <KpiCard
          label="Team Size"
          value={members.length || project.member_count}
          sub="active members"
          color="var(--primary)"
        />
      </div>

      {/* Description */}
      {project.summary && (
        <div className="card px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Project Summary</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)', lineHeight: 1.75 }}>{project.summary}</p>
        </div>
      )}

      {/* Members */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="section-title">Team Members</p>
            <p className="section-sub">
              {members.length} members · {monthlyHoursTotal.toFixed(1)}h this month · {totalHoursLogged.toFixed(1)}h all time
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select value={month} onChange={e => setMonth(Number(e.target.value))}
              className="form-input form-select" style={{ height: 30, fontSize: 12, paddingRight: 24 }}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="form-input form-select" style={{ height: 30, fontSize: 12, paddingRight: 24 }}>
              {Array.from({ length: new Date().getFullYear() - 2022 }, (_, i) => 2023 + i).map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Hours chart */}
        {!loading && chartData.length > 0 && (
          <div className="px-5 pt-4 pb-0">
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              {MONTHS[month - 1]} {year} hours per member
            </p>
            <ResponsiveContainer width="100%" height={Math.min(180, chartData.length * 32 + 20)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 40, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text)' }} width={Math.min(200, Math.max(100, chartData.reduce((m, d) => Math.max(m, (d.name || '').length), 0) * 8))} axisLine={false} tickLine={false} />
                <Tooltip formatter={v => [`${v}h`, 'Hours']} />
                <Bar dataKey="hours" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <DataTable
          columns={MEMBER_COLS}
          data={members}
          loading={loading}
          emptyMessage="No members found"
        />
      </div>

      {/* Tasks */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <p className="section-title">Tasks</p>
            <p className="section-sub">
              {completedCount} of {tasks.length} completed · {tasks.length - completedCount} open
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { key: 'all', label: `All (${tasks.length})` },
              { key: 'incomplete', label: `Open (${tasks.filter(t => t.status === 'incomplete').length})` },
              { key: 'completed', label: `Done (${completedCount})` },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setTaskFilter(f.key)}
                style={{
                  height: 28, padding: '0 10px', fontSize: 12, cursor: 'pointer', borderRadius: 6,
                  border: `1px solid ${taskFilter === f.key ? 'var(--primary)' : 'var(--border)'}`,
                  background: taskFilter === f.key ? 'var(--primary-light)' : 'var(--bg)',
                  color: taskFilter === f.key ? 'var(--primary)' : 'var(--text-secondary)',
                  fontWeight: taskFilter === f.key ? 700 : 400,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <DataTable
          columns={TASK_COLS}
          data={filteredTasks}
          loading={loading}
          emptyMessage="No tasks found"
        />
      </div>
    </div>
  );
}

const TREE_COLORS = ['#1D9E75', '#378ADD', '#EF9F27', '#7C3AED', '#EC4899', '#0891B2', '#E24B4A', '#65A30D', '#D97706', '#6366F1'];

function TreeCell({ x, y, width, height, index, name, hours }) {
  if (width < 4 || height < 4) return null;
  const showLabel = width > 70 && height > 34;
  const color = TREE_COLORS[index % TREE_COLORS.length];
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx={4}
        style={{ fill: color, stroke: 'var(--card-bg, #fff)', strokeWidth: 3, opacity: 0.88 }} />
      {showLabel && (
        <>
          <text x={x + 8} y={y + 18} style={{ fill: '#fff', fontSize: 11, fontWeight: 700, pointerEvents: 'none' }}>
            {name.length > width / 7 ? name.slice(0, Math.floor(width / 7)) + '…' : name}
          </text>
          <text x={x + 8} y={y + 32} style={{ fill: '#fff', fontSize: 10, opacity: 0.85, pointerEvents: 'none' }}>
            {hours}h
          </text>
        </>
      )}
    </g>
  );
}

function HoursTreemapCard() {
  const [period, setPeriod] = useState('month');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get(`/projects/hours-chart?period=${period}`)
      .then(res => setData((res.data.data || []).filter(d => d.hours > 0).slice(0, 14)))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [period]);

  const total = data.reduce((s, d) => s + d.hours, 0);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 flex-wrap gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <p className="section-title">Where Time Goes · Hours by Project</p>
          <p className="section-sub">{total > 0 ? `${total.toFixed(0)}h logged ${period === 'month' ? 'this month' : period === 'week' ? 'last 7 days' : 'all time'}` : 'Logged project hours'}</p>
        </div>
        <div className="flex gap-1">
          {[['week', 'Week'], ['month', 'Month'], ['all', 'All Time']].map(([val, label]) => (
            <button key={val} onClick={() => setPeriod(val)}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              style={period === val
                ? { background: 'var(--primary)', color: '#fff' }
                : { background: 'var(--bg)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="skeleton h-56 rounded" />
        ) : data.length === 0 ? (
          <div className="text-center py-14" style={{ color: 'var(--text-muted)' }}>
            <p className="text-sm">No project hours logged in this period</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <Treemap data={data} dataKey="hours" nameKey="name" isAnimationActive={false}
              content={<TreeCell />}>
              <Tooltip formatter={v => [`${v}h`, 'Hours']} />
            </Treemap>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function Projects() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [selected, setSelected] = useState(null);
  const [statuses, setStatuses] = useState([]);

  // Fetch all project names once for the jump-to dropdown
  useEffect(() => {
    Promise.all([
      api.get('/projects/statuses'),
      api.get('/projects'),
    ]).then(([sRes, pRes]) => {
      setStatuses(sRes.data.statuses || []);
      const all = pRes.data.projects || [];
      setAllProjects(all);
      // Deep link: /projects?id=X opens that project's detail view
      const urlId = searchParams.get('id');
      if (urlId) {
        const proj = all.find(p => String(p.id) === urlId);
        if (proj) setSelected(proj);
      }
    }).catch(() => {});
  }, []);

  const fetchProjects = (status = statusFilter) => {
    setLoading(true);
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    api.get(`/projects?${p}`)
      .then(res => setProjects(res.data.projects || []))
      .catch(err => toast(err.response?.data?.message || 'Failed to load projects'))
      .finally(() => setLoading(false));
  };

  const handleStatusChange = (val) => {
    setStatusFilter(val);
    setProjectFilter('');
    fetchProjects(val);
  };

  const handleProjectSelect = (val) => {
    setProjectFilter(val);
    if (!val) return;
    const proj = allProjects.find(p => String(p.id) === val);
    if (proj) setSelected(proj);
  };

  useEffect(() => { fetchProjects(); }, [refreshKey]);

  if (selected) return <ProjectDetail project={selected} onBack={() => setSelected(null)} />;

  const overdueCount = projects.filter(p =>
    p.days_remaining !== null && p.days_remaining < 0 &&
    !['completed', 'canceled', 'cancelled'].includes((p.status || '').toLowerCase())
  ).length;

  return (
    <div className="space-y-5 fade-up">
      {/* Filter bar */}
      <div className="card px-5 py-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Status</label>
          <select value={statusFilter} onChange={e => handleStatusChange(e.target.value)} className="form-input form-select" style={{ minWidth: 150, paddingRight: 28 }}>
            <option value="">All Statuses</option>
            {statuses.map(s => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Jump to Project</label>
          <select value={projectFilter} onChange={e => handleProjectSelect(e.target.value)} className="form-input form-select" style={{ minWidth: 220, paddingRight: 28 }}>
            <option value="">Select a project…</option>
            {allProjects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-3 self-end pb-0.5">
          <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
          {overdueCount > 0 && (
            <span className="pill pill-red">{overdueCount} overdue</span>
          )}
        </div>
      </div>

      {/* Org-wide hours by project treemap */}
      <HoursTreemapCard />

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-52 rounded-xl" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-24" style={{ color: 'var(--text-muted)' }}>
          <MdFolderOpen size={48} style={{ opacity: 0.2, marginBottom: 12 }} />
          <p className="text-sm font-medium">No projects found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {projects.map(p => <ProjectCard key={p.id} project={p} onClick={setSelected} />)}
        </div>
      )}
    </div>
  );
}

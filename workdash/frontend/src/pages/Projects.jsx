import { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { MdSearch, MdArrowBack, MdPeople, MdSchedule, MdCalendarToday, MdFolderOpen } from 'react-icons/md';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function StatusPill({ status }) {
  const map = {
    active:    'pill pill-green',
    completed: 'pill pill-blue',
    on_hold:   'pill pill-amber',
    paused:    'pill pill-amber',
    cancelled: 'pill pill-red',
  };
  return <span className={map[status?.toLowerCase()] || 'pill pill-gray'}>{status || 'Unknown'}</span>;
}

function ProjectCard({ project, onClick }) {
  const pct = project.completion_pct || 0;
  return (
    <div
      onClick={() => onClick(project)}
      className="card p-5 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 fade-up"
      style={{ '--hover-shadow': 'var(--card-shadow-md)' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--card-shadow-md)'; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--card-shadow)'; }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-[14px] leading-snug truncate" style={{ color: 'var(--text)' }}>
            {project.name}
          </p>
          {project.client_name && (
            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{project.client_name}</p>
          )}
        </div>
        <StatusPill status={project.status} />
      </div>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4">
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <MdPeople size={13} /> {project.member_count} members
        </span>
        <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
          <MdSchedule size={13} /> {parseFloat(project.hours_logged || 0).toFixed(1)}h logged
        </span>
        {project.deadline && (
          <span className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
            <MdCalendarToday size={12} /> {new Date(project.deadline).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
        )}
      </div>

      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs mb-1.5">
          <span style={{ color: 'var(--text-muted)' }}>{project.completed_tasks}/{project.total_tasks} tasks</span>
          <span className="font-bold" style={{ color: 'var(--primary)' }}>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: pct >= 80 ? 'var(--primary)' : pct >= 40 ? 'var(--warning)' : 'var(--danger)' }}
          />
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

  const totalHours = members.reduce((s, m) => s + (parseFloat(m.hours) || 0), 0);
  const doneTasks = tasks.filter(t => t.status === 'completed').length;
  const pct = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;

  const chartData = members
    .filter(m => m.hours > 0)
    .sort((a, b) => b.hours - a.hours)
    .map(m => ({ name: m.name.split(' ')[0], hours: parseFloat(m.hours) || 0 }));

  return (
    <div className="space-y-5 fade-up">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="btn btn-secondary gap-1.5">
          <MdArrowBack size={16} /> Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-bold text-lg leading-tight" style={{ color: 'var(--text)' }}>{project.name}</h2>
            <StatusPill status={project.status} />
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {project.client_name && `${project.client_name} · `}
            {project.deadline && `Due ${new Date(project.deadline).toLocaleDateString()}`}
          </p>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Hours',    value: `${totalHours.toFixed(1)}h`, color: 'var(--info)' },
          { label: 'Members',        value: project.member_count,         color: 'var(--primary)' },
          { label: 'Tasks Done',     value: `${doneTasks}/${tasks.length}`, color: 'var(--warning)' },
          { label: 'Completion',     value: `${pct}%`,                    color: 'var(--primary)' },
        ].map(s => (
          <div key={s.label} className="card p-5 text-center">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs font-medium mt-1" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* 2-col */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Member chart */}
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="section-title">Member Hours</p>
            <div className="flex gap-2">
              <select value={month} onChange={e => setMonth(Number(e.target.value))} className="form-input form-select" style={{ height: 30, fontSize: 12, paddingRight: 24 }}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="form-input form-select" style={{ height: 30, fontSize: 12, paddingRight: 24 }}>
                {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="skeleton h-44 rounded" />
            ) : chartData.length === 0 ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No hours logged this month</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 4, bottom: 4 }}>
                  <XAxis type="number" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 12, fill: 'var(--text)' }} width={72} axisLine={false} tickLine={false} />
                  <Tooltip formatter={v => [`${v}h`, 'Hours']} />
                  <Bar dataKey="hours" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tasks list */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <p className="section-title">Task Progress</p>
            <p className="section-sub">{doneTasks} of {tasks.length} completed</p>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-8 rounded-lg" />)}</div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No tasks found</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {tasks.map(t => (
                  <div key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: t.status === 'completed' ? 'var(--primary)' : 'var(--border)' }}
                    />
                    <span className="text-xs flex-1 truncate" style={{ color: 'var(--text)' }}>{t.title}</span>
                    <span className={`pill text-[10px] ${t.status === 'completed' ? 'pill-green' : 'pill-gray'}`}>
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Projects() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  const fetchProjects = () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (statusFilter) p.set('status', statusFilter);
    if (search) p.set('search', search);
    api.get(`/projects?${p}`)
      .then(res => setProjects(res.data.projects || []))
      .catch(err => toast(err.response?.data?.message || 'Failed to load projects'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProjects(); }, [refreshKey]);

  if (selected) return <ProjectDetail project={selected} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-5 fade-up">
      {/* Filter */}
      <div className="card px-5 py-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="form-input form-select" style={{ paddingRight: 28 }}>
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>Search</label>
          <div className="relative">
            <MdSearch size={15} className="absolute left-2.5 top-[50%] -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchProjects()}
              placeholder="Search projects…"
              className="form-input"
              style={{ paddingLeft: 28, width: 200 }}
            />
          </div>
        </div>
        <button onClick={fetchProjects} className="btn btn-primary">Apply</button>
        <div className="ml-auto flex items-end">
          <span className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            {projects.length} project{projects.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-xl" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-24" style={{ color: 'var(--text-muted)' }}>
          <MdFolderOpen size={48} className="opacity-20 mb-3" />
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

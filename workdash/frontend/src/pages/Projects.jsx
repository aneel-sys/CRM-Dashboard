import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { MdSearch, MdFolderOpen, MdPeople, MdSchedule, MdArrowBack } from 'react-icons/md';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '../components/Toast';
import api from '../api/axios';

const STATUS_COLORS = {
  active: 'bg-green-100 text-green-700',
  completed: 'bg-blue-100 text-blue-700',
  on_hold: 'bg-amber-100 text-amber-700',
  paused: 'bg-amber-100 text-amber-700',
};

function StatusPill({ status }) {
  const color = STATUS_COLORS[status?.toLowerCase()] || 'bg-gray-100 text-gray-600';
  return (
    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${color}`}>
      {status || 'Unknown'}
    </span>
  );
}

function ProjectCard({ project, onClick }) {
  return (
    <div
      onClick={() => onClick(project)}
      className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5 cursor-pointer hover:shadow-md hover:border-[#1D9E75]/40 transition-all fade-in"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-[var(--color-text)] text-base leading-tight">{project.name}</h3>
          {project.client_name && <div className="text-xs text-[var(--color-muted)] mt-0.5">{project.client_name}</div>}
        </div>
        <StatusPill status={project.status} />
      </div>

      <div className="flex items-center gap-4 text-xs text-[var(--color-muted)] mb-4">
        <span className="flex items-center gap-1"><MdPeople size={14} />{project.member_count} members</span>
        <span className="flex items-center gap-1"><MdSchedule size={14} />{parseFloat(project.hours_logged).toFixed(1)}h logged</span>
        {project.deadline && (
          <span className="flex items-center gap-1">
            📅 {new Date(project.deadline).toLocaleDateString()}
          </span>
        )}
      </div>

      <div>
        <div className="flex justify-between text-xs mb-1">
          <span className="text-[var(--color-muted)]">{project.completed_tasks}/{project.total_tasks} tasks</span>
          <span className="font-semibold text-[#1D9E75]">{project.completion_pct}%</span>
        </div>
        <div className="h-2 bg-[var(--color-border)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-[#1D9E75] transition-all"
            style={{ width: `${project.completion_pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ProjectDetail({ project, onBack }) {
  const toast = useToast();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  useEffect(() => {
    setLoadingMembers(true);
    Promise.all([
      api.get(`/projects/${project.id}/members?month=${month}&year=${year}`),
      api.get(`/projects/${project.id}/tasks`),
    ]).then(([mRes, tRes]) => {
      setMembers(mRes.data.members || []);
      setTasks(tRes.data.tasks || []);
    }).catch(err => toast(err.response?.data?.message || 'Failed to load project details'))
      .finally(() => setLoadingMembers(false));
  }, [project.id, month, year]);

  const totalDone = tasks.filter(t => t.status === 'completed').length;
  const completionPct = tasks.length ? Math.round((totalDone / tasks.length) * 100) : 0;
  const totalHours = members.reduce((s, m) => s + (parseFloat(m.hours) || 0), 0);

  const memberChartData = members
    .filter(m => m.hours > 0)
    .map(m => ({ name: m.name.split(' ')[0], hours: parseFloat(m.hours) || 0 }));

  return (
    <div className="fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="flex items-center gap-1 text-[var(--color-muted)] hover:text-[var(--color-text)] text-sm transition-colors">
          <MdArrowBack size={18} /> Back
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h2 className="font-bold text-[var(--color-text)] text-xl">{project.name}</h2>
            <StatusPill status={project.status} />
          </div>
          <div className="text-sm text-[var(--color-muted)] mt-0.5">
            {project.client_name && <span>{project.client_name} · </span>}
            {project.deadline && <span>Due {new Date(project.deadline).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Hours', value: `${totalHours.toFixed(1)}h`, color: '#378ADD' },
          { label: 'Members', value: project.member_count, color: '#1D9E75' },
          { label: 'Tasks Done', value: `${totalDone}/${tasks.length}`, color: '#EF9F27' },
          { label: 'Completion', value: `${completionPct}%`, color: '#1D9E75' },
        ].map(s => (
          <div key={s.label} className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-4 text-center">
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-[var(--color-muted)] mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* 2-col */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Member hours chart */}
        <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-[var(--color-text)]">Member Hours</h3>
            <div className="flex items-center gap-2">
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="border border-[var(--color-border)] rounded px-2 py-1 text-xs bg-[var(--color-card)] text-[var(--color-text)]">
                {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="border border-[var(--color-border)] rounded px-2 py-1 text-xs bg-[var(--color-card)] text-[var(--color-text)]">
                {[2023,2024,2025,2026].map(y => <option key={y}>{y}</option>)}
              </select>
            </div>
          </div>
          {loadingMembers ? (
            <div className="skeleton h-40 rounded" />
          ) : memberChartData.length === 0 ? (
            <div className="text-center py-8 text-[var(--color-muted)] text-sm">No hours logged this month</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={memberChartData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={v => [`${v}h`, 'Hours']} />
                <Bar dataKey="hours" fill="#1D9E75" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tasks breakdown */}
        <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-5">
          <h3 className="font-semibold text-[var(--color-text)] mb-4">Task Progress</h3>
          {loadingMembers ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-8 rounded" />)}</div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-8 text-[var(--color-muted)] text-sm">No tasks found</div>
          ) : (
            <div className="space-y-3 max-h-56 overflow-y-auto">
              {tasks.slice(0, 20).map(t => (
                <div key={t.id} className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${t.status === 'completed' ? 'bg-green-500' : 'bg-amber-400'}`} />
                  <span className="text-sm text-[var(--color-text)] flex-1 truncate">{t.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          )}
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
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (search) params.set('search', search);
    api.get(`/projects?${params}`)
      .then(res => setProjects(res.data.projects || []))
      .catch(err => toast(err.response?.data?.message || 'Failed to load projects'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchProjects(); }, [refreshKey]);

  if (selected) {
    return <ProjectDetail project={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="fade-in space-y-5">
      {/* Filter */}
      <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-[var(--color-muted)] mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="border border-[var(--color-border)] rounded-lg px-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On Hold</option>
          </select>
        </div>
        <div className="relative">
          <label className="block text-xs text-[var(--color-muted)] mb-1">Search</label>
          <div className="relative">
            <MdSearch size={16} className="absolute left-2.5 top-2.5 text-[var(--color-muted)]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchProjects()}
              placeholder="Search projects…"
              className="border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-sm bg-[var(--color-card)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#1D9E75] w-52"
            />
          </div>
        </div>
        <button onClick={fetchProjects} className="bg-[#1D9E75] hover:bg-[#0F6E56] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          Apply
        </button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-44 rounded-xl" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20 text-[var(--color-muted)]">
          <div className="text-4xl mb-3"><MdFolderOpen /></div>
          <p>No projects found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map(p => <ProjectCard key={p.id} project={p} onClick={setSelected} />)}
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MdDashboard, MdAccessTime, MdPeople, MdPerson, MdFolderOpen,
  MdBarChart, MdNotifications, MdSettings, MdBadge, MdDescription, MdSearch,
} from 'react-icons/md';
import api from '../api/axios';

const PAGES = [
  { label: 'Overview',       to: '/',              icon: MdDashboard },
  { label: 'Attendance',     to: '/attendance',    icon: MdAccessTime },
  { label: 'Team',           to: '/team',          icon: MdPeople },
  { label: 'Per Person',     to: '/person',        icon: MdPerson },
  { label: 'Projects',       to: '/projects',      icon: MdFolderOpen },
  { label: 'Project Dashboard', to: '/project-dashboard', icon: MdBarChart },
  { label: 'Timings',        to: '/timings',       icon: MdAccessTime },
  { label: 'Reports',        to: '/reports',       icon: MdDescription },
  { label: 'HR Dashboard',   to: '/hr',            icon: MdBadge },
  { label: 'Alerts',         to: '/notifications', icon: MdNotifications },
  { label: 'Settings',       to: '/settings',      icon: MdSettings },
];

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const loadedRef = useRef(false);

  // Load people + projects once, on first open
  useEffect(() => {
    if (!open || loadedRef.current) return;
    loadedRef.current = true;
    api.get('/employees').then(res => setEmployees(res.data.employees || [])).catch(() => {});
    api.get('/projects').then(res => setProjects(res.data.projects || [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = s => (s || '').toLowerCase().includes(q);
    const people = (q ? employees.filter(e => match(e.name) || match(e.department)) : employees)
      .slice(0, q ? 6 : 4)
      .map(e => ({ type: 'Person', label: e.name, sub: e.department || e.designation || '', icon: MdPerson, to: `/person?id=${e.id}` }));
    const projs = (q ? projects.filter(p => match(p.name)) : projects)
      .slice(0, q ? 5 : 3)
      .map(p => ({ type: 'Project', label: p.name, sub: (p.status || '').replace(/_/g, ' '), icon: MdFolderOpen, to: `/projects?id=${p.id}` }));
    const pages = (q ? PAGES.filter(p => match(p.label)) : PAGES.slice(0, 5))
      .map(p => ({ type: 'Page', label: p.label, sub: '', icon: p.icon, to: p.to }));
    return [...people, ...projs, ...pages];
  }, [query, employees, projects]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const go = item => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[activeIdx]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  // Keep the active row visible while arrowing through results
  useEffect(() => {
    listRef.current?.children[activeIdx]?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  if (!open) return null;

  let lastType = null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '14vh',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="card"
        style={{ width: 'min(560px, 92vw)', overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}
      >
        <div className="flex items-center gap-3 px-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <MdSearch size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search people, projects, pages…"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              padding: '14px 0', fontSize: 14, color: 'var(--text)',
            }}
          />
          <kbd style={{ fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', background: 'var(--bg)' }}>ESC</kbd>
        </div>
        <div ref={listRef} style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
          {results.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text-muted)' }}>No results for “{query}”</p>
          ) : (
            results.map((r, i) => {
              const header = r.type !== lastType ? r.type : null;
              lastType = r.type;
              const Icon = r.icon;
              return (
                <div key={`${r.type}-${r.label}-${i}`}>
                  {header && (
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', padding: '8px 10px 4px' }}>
                      {header === 'Person' ? 'People' : header === 'Project' ? 'Projects' : 'Pages'}
                    </p>
                  )}
                  <div
                    onClick={() => go(r)}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                      background: i === activeIdx ? 'var(--primary-light)' : 'transparent',
                    }}
                  >
                    <Icon size={16} style={{ color: i === activeIdx ? 'var(--primary-dark)' : 'var(--text-muted)', flexShrink: 0 }} />
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--text)', flex: 1 }}>{r.label}</span>
                    {r.sub && <span className="text-xs truncate" style={{ color: 'var(--text-muted)', maxWidth: 160 }}>{r.sub}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

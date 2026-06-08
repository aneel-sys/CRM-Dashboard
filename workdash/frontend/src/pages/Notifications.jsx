import { useState, useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  MdAccessTime, MdPersonOff, MdPeople, MdFolderOpen,
  MdWarning, MdRefresh, MdArrowForward, MdChevronLeft, MdChevronRight,
} from 'react-icons/md';
import { useToast } from '../components/Toast';
import api from '../api/axios';
import { fmtTime } from '../utils/time';
import { useSettings } from '../context/SettingsContext';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PAGE_SIZE = 8;

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysFromNow(d) {
  const diff = Math.ceil((new Date(d) - new Date()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff < 0) return `${Math.abs(diff)}d overdue`;
  return `in ${diff}d`;
}

function SectionCard({ icon: Icon, title, count, color, bg, border, children, action }) {
  return (
    <div className="card overflow-hidden fade-up">
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ borderBottom: '1px solid var(--border)', background: bg }}
      >
        <div className="flex items-center gap-3">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={18} style={{ color }} />
          </div>
          <div>
            <p className="font-bold text-[14px]" style={{ color }}>{title}</p>
            <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{count} alert{count !== 1 ? 's' : ''}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--border)' }}>{children}</div>
    </div>
  );
}

function Row({ children, onClick }) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3"
      onClick={onClick}
      style={{ cursor: onClick ? 'pointer' : 'default' }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--bg)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = ''; }}
    >
      {children}
    </div>
  );
}

function Paginator({ page, total, onChange }) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between px-5 py-2.5" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{start}–{end} of {total}</span>
      <div className="flex items-center gap-1">
        <button
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: page === 1 ? 'not-allowed' : 'pointer', opacity: page === 1 ? 0.35 : 1 }}
        >
          <MdChevronLeft size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>
        {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
          <button
            key={p}
            onClick={() => onChange(p)}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              minWidth: 28, height: 28, borderRadius: 6, fontSize: 12, cursor: 'pointer',
              border: p === page ? '1px solid var(--primary)' : '1px solid var(--border)',
              background: p === page ? 'var(--primary)' : 'var(--bg)',
              color: p === page ? '#fff' : 'var(--text-secondary)',
              fontWeight: p === page ? 700 : 400,
            }}
          >
            {p}
          </button>
        ))}
        <button
          disabled={page === pages}
          onClick={() => onChange(page + 1)}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: page === pages ? 'not-allowed' : 'pointer', opacity: page === pages ? 0.35 : 1 }}
        >
          <MdChevronRight size={16} style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>
    </div>
  );
}

export default function Notifications() {
  const { refreshKey } = useOutletContext();
  const { timeFormat } = useSettings();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lateP, setLateP] = useState(1);
  const [absentP, setAbsentP] = useState(1);
  const [lowAttP, setLowAttP] = useState(1);
  const [deadlinesP, setDeadlinesP] = useState(1);
  const [overdueP, setOverdueP] = useState(1);

  const paginate = (arr, page) => (arr || []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const load = () => {
    setLoading(true);
    setLateP(1); setAbsentP(1); setLowAttP(1); setDeadlinesP(1); setOverdueP(1);
    api.get('/notifications/expanded')
      .then(res => setData(res.data))
      .catch(err => toast(err.response?.data?.message || 'Failed to load notifications'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [refreshKey]);

  const today = new Date().toISOString().slice(0, 10);
  const monthLabel = MONTHS[(data?.month || new Date().getMonth() + 1) - 1];

  if (loading) {
    return (
      <div className="space-y-4 fade-up">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-40 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="section-title text-base">Live Alerts</p>
          <p className="section-sub">Auto-updates every 60s · {fmtTime(new Date(), timeFormat)}</p>
        </div>
        <button onClick={load} className="btn btn-secondary gap-2">
          <MdRefresh size={15} /> Refresh
        </button>
      </div>

      {/* 1. Late Today */}
      {(data?.lateToday?.length > 0) && (
        <SectionCard
          icon={MdAccessTime}
          title="Late Arrivals Today"
          count={data.lateToday.length}
          color="#D97706" bg="#FFFBEB" border="#FDE68A"
          action={
            <button onClick={() => navigate('/attendance?status=Late')} className="btn btn-secondary gap-1 text-xs" style={{ height: 28, padding: '0 10px' }}>
              View All <MdArrowForward size={12} />
            </button>
          }
        >
          {paginate(data.lateToday, lateP).map(r => (
            <Row key={r.id} onClick={() => navigate(`/person?id=${r.id}`)}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{r.name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Clocked in at {fmtTime(r.clock_in_time, timeFormat)}</p>
              </div>
              <span className="pill pill-amber">+{r.delay}m late</span>
            </Row>
          ))}
          <Paginator page={lateP} total={data.lateToday.length} onChange={setLateP} />
        </SectionCard>
      )}

      {/* 2. Absent Today */}
      {(data?.absentToday?.length > 0) && (
        <SectionCard
          icon={MdPersonOff}
          title="Absent Today"
          count={data.absentToday.length}
          color="#DC2626" bg="#FEF2F2" border="#FECACA"
          action={
            <button onClick={() => navigate('/attendance?status=Absent')} className="btn btn-secondary gap-1 text-xs" style={{ height: 28, padding: '0 10px' }}>
              View All <MdArrowForward size={12} />
            </button>
          }
        >
          {paginate(data.absentToday, absentP).map((r, i) => (
            <Row key={r.id ?? i} onClick={() => navigate(`/person?id=${r.id}`)}>
              <p className="text-sm font-medium" style={{ color: 'var(--text)' }}>{r.name}</p>
              <span className="pill pill-gray">No clock-in</span>
            </Row>
          ))}
          <Paginator page={absentP} total={data.absentToday.length} onChange={setAbsentP} />
        </SectionCard>
      )}

      {/* 3. Low Attendance */}
      {(data?.lowAttendance?.length > 0) && (
        <SectionCard
          icon={MdPeople}
          title={`Below 75% Attendance — ${monthLabel}`}
          count={data.lowAttendance.length}
          color="#D97706" bg="#FFFBEB" border="#FDE68A"
          action={
            <button onClick={() => navigate('/team')} className="btn btn-secondary gap-1 text-xs" style={{ height: 28, padding: '0 10px' }}>
              View Team <MdArrowForward size={12} />
            </button>
          }
        >
          {paginate(data.lowAttendance, lowAttP).map(r => {
            const pct = data.workingDays ? Math.round((r.present_days / data.workingDays) * 100) : 0;
            return (
              <Row key={r.id} onClick={() => navigate(`/person?id=${r.id}`)}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{r.name}</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.present_days} of {data.workingDays} days present</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p className="text-sm font-bold" style={{ color: pct < 50 ? 'var(--danger)' : 'var(--warning)' }}>{pct}%</p>
                  <div style={{ width: 60, height: 4, borderRadius: 99, background: 'var(--border)', marginTop: 4 }}>
                    <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: pct < 50 ? 'var(--danger)' : 'var(--warning)' }} />
                  </div>
                </div>
              </Row>
            );
          })}
          <Paginator page={lowAttP} total={data.lowAttendance.length} onChange={setLowAttP} />
        </SectionCard>
      )}

      {/* 4. Upcoming Deadlines */}
      {(data?.upcomingDeadlines?.length > 0) && (
        <SectionCard
          icon={MdFolderOpen}
          title="Project Deadlines This Week"
          count={data.upcomingDeadlines.length}
          color="#2563EB" bg="#EFF6FF" border="#BFDBFE"
          action={
            <button onClick={() => navigate('/projects')} className="btn btn-secondary gap-1 text-xs" style={{ height: 28, padding: '0 10px' }}>
              View Projects <MdArrowForward size={12} />
            </button>
          }
        >
          {paginate(data.upcomingDeadlines, deadlinesP).map(r => (
            <Row key={r.id}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{r.project_name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Due {fmtDate(r.deadline)}</p>
              </div>
              <span className="pill pill-blue">{daysFromNow(r.deadline)}</span>
            </Row>
          ))}
          <Paginator page={deadlinesP} total={data.upcomingDeadlines.length} onChange={setDeadlinesP} />
        </SectionCard>
      )}

      {/* 5. Overdue Projects */}
      {(data?.overdueProjects?.length > 0) && (
        <SectionCard
          icon={MdWarning}
          title="Overdue Projects"
          count={data.overdueProjects.length}
          color="#DC2626" bg="#FEF2F2" border="#FECACA"
          action={
            <button onClick={() => navigate('/projects')} className="btn btn-secondary gap-1 text-xs" style={{ height: 28, padding: '0 10px' }}>
              View Projects <MdArrowForward size={12} />
            </button>
          }
        >
          {paginate(data.overdueProjects, overdueP).map(r => (
            <Row key={r.id}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{r.project_name}</p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Was due {fmtDate(r.deadline)}</p>
              </div>
              <span className="pill pill-red">{daysFromNow(r.deadline)}</span>
            </Row>
          ))}
          <Paginator page={overdueP} total={data.overdueProjects.length} onChange={setOverdueP} />
        </SectionCard>
      )}

      {/* All clear */}
      {data && !data.lateToday?.length && !data.absentToday?.length && !data.lowAttendance?.length && !data.upcomingDeadlines?.length && !data.overdueProjects?.length && (
        <div className="card flex flex-col items-center justify-center py-20" style={{ color: 'var(--text-muted)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 12 }}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="9 12 11 14 15 10" />
          </svg>
          <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>All clear</p>
          <p className="text-xs mt-1">No active alerts right now</p>
        </div>
      )}
    </div>
  );
}

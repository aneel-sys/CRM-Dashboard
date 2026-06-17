import { useState, useEffect, useRef, useMemo } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area, ReferenceLine,
} from 'recharts';
import {
  MdPeople, MdAccessTime, MdPersonOff, MdAvTimer, MdBeachAccess, MdWork, MdSignalWifi4Bar,
  MdTrendingUp, MdFolderOpen, MdEmojiEvents, MdCheckCircle, MdCalendarToday,
  MdInsights, MdArrowForward,
} from 'react-icons/md';
import StatCard from '../components/StatCard';
import { useToast } from '../components/Toast';
import api from '../api/axios';
import { fmtTime } from '../utils/time';
import { useSettings } from '../context/SettingsContext';
import { useSSE } from '../context/SSEContext';
import { useAuth } from '../context/AuthContext';

// Present green · On Leave purple (matches leave color everywhere) · Absent red
const DONUT_COLORS  = ['#1D9E75', '#8B5CF6', '#E24B4A', '#EF9F27'];
const HEALTH_COLORS = { onTrack: '#1D9E75', atRisk: '#EF9F27', overdue: '#E24B4A' };

// Avatar color palette — deterministic by name hash
const AVATAR_COLORS = [
  '#1D9E75', '#378ADD', '#8B5CF6', '#EF9F27', '#E24B4A',
  '#06B6D4', '#F59E0B', '#EC4899', '#14B8A6', '#6366F1',
];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// Delay severity helper
function delaySeverity(mins) {
  if (mins <= 15) return { cls: 'delay-mild', color: '#D97706' };
  if (mins <= 30) return { cls: 'delay-moderate', color: '#EA580C' };
  return { cls: 'delay-severe', color: '#DC2626' };
}

// ─── helpers ──────────────────────────────────────────────────────────────

function getFormattedDate(dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const day     = String(d.getDate()).padStart(2, '0');
  const month   = d.toLocaleDateString('en-GB', { month: 'long' });
  return `${weekday}, ${day} ${month}`;
}

function getShortDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// ─── Command Center ────────────────────────────────────────────────────────

function CommandCenter({ mode, onModeChange, customDate, onCustomDateChange }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayLabel = getFormattedDate();

  const customLabel = customDate
    ? getFormattedDate(customDate)
    : 'Select a date';

  return (
    <div className="command-bar">
      {/* Today's Overview tab */}
      <button
        className={`mode-card mode-card--today ${mode === 'today' ? 'mode-card--active' : ''}`}
        onClick={() => onModeChange('today')}
      >
        <div className="mode-card__icon">
          <MdTrendingUp size={22} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p className="mode-card__title">Today's Overview</p>
            {mode === 'today' && (
              <span className="mode-card__badge mode-card__badge--live">
                <span className="live-dot" />
                LIVE
              </span>
            )}
          </div>
          <p className="mode-card__sub">{todayLabel}</p>
        </div>
        {mode === 'today' && (
          <MdCheckCircle size={20} style={{ color: '#1D9E75', flexShrink: 0 }} />
        )}
      </button>

      {/* Custom Date tab */}
      <button
        className={`mode-card mode-card--custom ${mode === 'custom' ? 'mode-card--active' : ''}`}
        onClick={() => onModeChange('custom')}
        style={{ pointerEvents: mode === 'custom' ? 'auto' : undefined }}
      >
        <div className="mode-card__icon">
          <MdCalendarToday size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="mode-card__title">Custom Date</p>
          <p className="mode-card__sub">
            {mode === 'custom' ? customLabel : 'View historical data'}
          </p>
        </div>
        {mode === 'custom' && (
          <input
            type="date"
            value={customDate}
            max={todayStr}
            onChange={e => { e.stopPropagation(); onCustomDateChange(e.target.value); }}
            onClick={e => e.stopPropagation()}
            className="form-input"
            style={{ height: 34, fontSize: 12, borderRadius: 8, width: 'auto', flexShrink: 0, cursor: 'pointer' }}
          />
        )}
        {mode !== 'custom' && (
          <MdArrowForward size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        )}
      </button>
    </div>
  );
}

// ─── Section Card (new enterprise version) ─────────────────────────────────

function SectionCard({ title, subtitle, children, action, className = '', scrollable = false, maxScrollHeight = 340 }) {
  const bodyRef = useRef(null);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    if (!scrollable || !bodyRef.current) return;
    const el = bodyRef.current;
    setHasOverflow(el.scrollHeight > el.clientHeight);
  });

  return (
    <div className={`section-card ${className}`}>
      <div className="section-card__header">
        <div>
          <p className="section-title">{title}</p>
          {subtitle && <p className="section-sub">{subtitle}</p>}
        </div>
        {action}
      </div>
      {scrollable ? (
        <div className="section-card__body">
          <div className={`scrollable-list-wrapper ${hasOverflow ? 'has-overflow' : ''}`}>
            <div ref={bodyRef} className="scrollable-list" style={{ maxHeight: maxScrollHeight }}>
              {children}
            </div>
          </div>
        </div>
      ) : (
        <div className="section-card__body">{children}</div>
      )}
    </div>
  );
}

// ─── Department Row with stacked bar ────────────────────────────────────────

function DeptRow({ dept, onClick }) {
  const pct   = dept.total > 0 ? Math.round((dept.present / dept.total) * 100) : 0;
  const color = pct >= 80 ? 'var(--primary)' : pct >= 60 ? 'var(--warning)' : 'var(--danger)';
  const presentPct = dept.total > 0 ? (dept.present / dept.total) * 100 : 0;
  const latePct    = dept.total > 0 ? (dept.late / dept.total) * 100 : 0;
  const absentPct  = dept.total > 0 ? (dept.absent / dept.total) * 100 : 0;

  return (
    <tr onClick={onClick}>
      <td style={{ fontWeight: 500, padding: '9px 8px 9px 0' }}>
        {dept.department}
      </td>
      <td style={{ textAlign: 'center' }}>
        <span className="font-bold text-sm" style={{ color: 'var(--primary)' }}>{dept.present}</span>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span className="text-sm" style={{ color: dept.late > 0 ? 'var(--warning)' : 'var(--text-muted)' }}>{dept.late}</span>
      </td>
      <td style={{ textAlign: 'center' }}>
        <span className="text-sm" style={{ color: dept.absent > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>{dept.absent}</span>
      </td>
      <td style={{ width: 140, padding: '9px 0 9px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="stacked-bar" style={{ flex: 1 }}>
            {presentPct > 0 && <div className="stacked-bar__seg" style={{ width: `${presentPct}%`, background: '#1D9E75' }} />}
            {latePct > 0 && <div className="stacked-bar__seg" style={{ width: `${latePct}%`, background: '#EF9F27' }} />}
            {absentPct > 0 && <div className="stacked-bar__seg" style={{ width: `${absentPct}%`, background: '#E24B4A' }} />}
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color, minWidth: 32, textAlign: 'right' }}>{pct}%</span>
        </div>
      </td>
    </tr>
  );
}

const RANK_COLORS = ['#EF9F27', '#9CA3AF', '#CD7C3B', '#6B7280', '#6B7280'];
const RANK_LABELS = ['1st', '2nd', '3rd', '4th', '5th'];

function RankBadge({ rank }) {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      background: RANK_COLORS[rank] + '22',
      border: `2px solid ${RANK_COLORS[rank]}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: 10, fontWeight: 800, color: RANK_COLORS[rank] }}>
        {RANK_LABELS[rank]}
      </span>
    </div>
  );
}

// ─── Sparkline (tiny inline 7-day trend) ───────────────────────────────────

function MiniSparkline({ data, color = '#1D9E75', height = 32 }) {
  if (!data || data.length < 2) return null;
  const id = `spark-${color.replace('#', '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0}    />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${id})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ─── Tooltips ──────────────────────────────────────────────────────────────

const TrendTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2 text-xs" style={{ boxShadow: 'var(--card-shadow-md)', minWidth: 120 }}>
      <p className="font-bold mb-1" style={{ color: 'var(--text)' }}>{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.color, margin: 0 }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

const DonutLegend = ({ payload }) => (
  <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
    {payload.map((entry, i) => (
      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: entry.color, display: 'inline-block' }} />
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {entry.value} <strong style={{ color: 'var(--text)' }}>{entry.payload.value}</strong>
        </span>
      </div>
    ))}
  </div>
);

// ─── Attendance Heatmap ────────────────────────────────────────────────────

const HEAT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const HEAT_MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function heatColor(pct) {
  if (pct === 0)   return '#FECACA';
  if (pct < 40)    return '#FEE2E2';
  if (pct < 60)    return '#FEF3C7';
  if (pct < 75)    return '#D1FAE5';
  if (pct < 90)    return '#6EE7B7';
  return '#1D9E75';
}

function AttendanceHeatmap({ data, total, year, onYearChange }) {
  const navigate = useNavigate();
  const map = {};
  (data || []).forEach(d => { map[d.date] = d; });

  const today = new Date().toISOString().slice(0, 10);
  const weeks = [];
  const monthLabels = {};

  // First Monday on or before Jan 1
  const jan1 = new Date(year, 0, 1);
  const isoOffset = (jan1.getDay() + 6) % 7;
  const cur = new Date(year, 0, 1 - isoOffset);
  let lastLabelMonth = -1;

  while (true) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const inYear = cur.getFullYear() === year;
      const ds = inYear
        ? `${year}-${String(cur.getMonth() + 1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`
        : null;
      week.push(ds);
      cur.setDate(cur.getDate() + 1);
    }
    const first = week.find(d => d !== null);
    if (first) {
      const m = new Date(first + 'T00:00:00').getMonth();
      if (m !== lastLabelMonth) { monthLabels[weeks.length] = HEAT_MONTHS[m]; lastLabelMonth = m; }
    }
    weeks.push(week);
    if (cur.getFullYear() > year || weeks.length >= 54) break;
  }

  const CELL = 12, GAP = 2;
  const cy = new Date().getFullYear();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button onClick={() => onYearChange(year - 1)} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', minWidth: 36, textAlign: 'center' }}>{year}</span>
          <button onClick={() => onYearChange(year + 1)} disabled={year >= cy} style={{ width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg)', cursor: year >= cy ? 'not-allowed' : 'pointer', fontSize: 14, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: year >= cy ? 0.35 : 1 }}>›</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginRight: 3 }}>Low</span>
          {['#FECACA','#FEE2E2','#FEF3C7','#D1FAE5','#6EE7B7','#1D9E75'].map((c, i) => (
            <div key={i} style={{ width: CELL, height: CELL, borderRadius: 3, background: c, border: '1px solid rgba(0,0,0,0.07)' }} />
          ))}
          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 3 }}>High</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column' }}>
          {/* Month labels */}
          <div style={{ display: 'flex', marginLeft: 22, marginBottom: 3 }}>
            {weeks.map((_, wi) => (
              <div key={wi} style={{ width: CELL + GAP, flexShrink: 0, fontSize: 9, fontWeight: 600, color: 'var(--text-muted)', overflow: 'visible', whiteSpace: 'nowrap' }}>
                {monthLabels[wi] || ''}
              </div>
            ))}
          </div>
          {/* Grid */}
          <div style={{ display: 'flex', gap: 0 }}>
            {/* Day labels — show M W F S */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: 4 }}>
              {['M','','W','','F','','S'].map((d, i) => (
                <div key={i} style={{ width: 16, height: CELL, fontSize: 9, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: GAP }}>
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
                  {week.map((date, di) => {
                    const isSun   = di === 6;
                    const entry   = date ? map[date] : null;
                    const isFuture = date && date > today;
                    const color = !date ? 'transparent'
                      : isFuture   ? '#F3F4F6'
                      : entry      ? heatColor(entry.pct)
                      : isSun      ? '#F9FAFB'
                      : '#F3F4F6';
                    const tip = entry
                      ? `${date}  ${entry.present}/${total} present (${entry.pct}%)`
                      : date || '';
                    return (
                      <div key={di} title={tip}
                        onClick={() => date && !isFuture && entry && navigate(`/attendance?date=${date}`)}
                        style={{
                          width: CELL, height: CELL, borderRadius: 3,
                          background: color,
                          border: date && !isFuture ? '1px solid rgba(0,0,0,0.05)' : 'none',
                          flexShrink: 0,
                          cursor: date && !isFuture && entry ? 'pointer' : 'default',
                        }} />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {total > 0 && (
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>
          {data.length} days with data · {total} active employees
        </p>
      )}
    </div>
  );
}

// ─── Leave Calendar ────────────────────────────────────────────────────────

function LeaveCalendar({ leaves, year, month, onPrev, onNext }) {
  const navigate = useNavigate();
  const byDate = {};
  (leaves || []).forEach(l => {
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  });

  const firstDay   = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today       = new Date().toISOString().slice(0, 10);

  const cells = Array(firstDay).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const uniqueOnLeave = new Set((leaves || []).map(l => l.name)).size;

  return (
    <div>
      {/* Nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={onPrev} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{HEAT_MONTHS_FULL[month - 1]} {year}</p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>
            {uniqueOnLeave > 0 ? `${uniqueOnLeave} employee${uniqueOnLeave !== 1 ? 's' : ''} on leave` : 'No approved leaves'}
          </p>
        </div>
        <button onClick={onNext} style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontSize: 15, color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 3 }}>
        {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-muted)', padding: '3px 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={i} style={{ minHeight: 46 }} />;
          const ds  = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
          const dl  = byDate[ds] || [];
          const isToday = ds === today;
          const isWeekend = i % 7 === 0 || i % 7 === 6;
          return (
            <div key={i} style={{
              minHeight: 46, padding: '3px 4px', overflow: 'hidden',
              background: isToday ? 'rgba(29,158,117,0.09)' : isWeekend ? 'var(--bg)' : 'var(--card)',
              borderRadius: 6,
              border: `1px solid ${isToday ? '#1D9E75' : 'var(--border)'}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: isToday ? 800 : 500, color: isToday ? '#1D9E75' : isWeekend ? 'var(--text-muted)' : 'var(--text)', marginBottom: 2 }}>{day}</div>
              {dl.slice(0, 2).map((l, li) => {
                const c = l.color || '#1D9E75';
                return (
                  <div key={li} title={`${l.name}${l.type_name ? ' — ' + l.type_name : ''}`}
                    onClick={() => l.user_id && navigate(`/person?id=${l.user_id}`)}
                    style={{
                      fontSize: 8, fontWeight: 600, padding: '1px 3px', marginBottom: 1,
                      background: c + '22', color: c, borderLeft: `2px solid ${c}`,
                      borderRadius: '0 3px 3px 0',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: l.user_id ? 'pointer' : 'default',
                    }}>
                    {l.name.split(' ')[0]}
                  </div>
                );
              })}
              {dl.length > 2 && <div style={{ fontSize: 8, color: 'var(--text-muted)', fontWeight: 600 }}>+{dl.length - 2}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── On-Time Ring (inline mini ring for Present card) ──────────────────────

function OnTimeRing({ onTime, total }) {
  const pct = total > 0 ? Math.round((onTime / total) * 100) : 0;
  const r = 11, circ = 2 * Math.PI * r;
  const offset = circ - (circ * pct / 100);
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg className="inline-ring" viewBox="0 0 28 28">
        <circle cx="14" cy="14" r={r} stroke="var(--border)" />
        <circle cx="14" cy="14" r={r} stroke="#1D9E75"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 14 14)" />
      </svg>
      <span style={{ fontSize: 12, color: '#1D9E75', fontWeight: 700 }}>
        {onTime} on time
        <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> ({pct}%)</span>
      </span>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function Overview() {
  const { refreshKey }  = useOutletContext();
  const navigate        = useNavigate();
  const toast           = useToast();
  const { timeFormat }  = useSettings();
  const { user }        = useAuth();
  const fmt             = dt => fmtTime(dt, timeFormat);

  const [mode, setMode]         = useState('today');
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10);
  });

  const handleModeChange = (newMode) => { setMode(newMode); };

  const [data, setData]                     = useState(null);
  const [loading, setLoading]               = useState(true);
  const [trend30, setTrend30]               = useState([]);
  const [trendLoading, setTrendLoading]     = useState(true);
  const [projectHealth, setProjectHealth]   = useState(null);
  const [healthLoading, setHealthLoading]   = useState(true);
  const [performers, setPerformers]         = useState([]);
  const [perfDays, setPerfDays]             = useState(0);
  const [perfLoading, setPerfLoading]       = useState(true);

  const _now = new Date();
  const [heatmapYear,    setHeatmapYear]    = useState(_now.getFullYear());
  const [heatmap,        setHeatmap]        = useState({ data: [], total: 0 });
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [calMonth,       setCalMonth]       = useState(_now.getMonth() + 1);
  const [calYear,        setCalYear]        = useState(_now.getFullYear());
  const [calLeaves,      setCalLeaves]      = useState([]);
  const [calLoading,     setCalLoading]     = useState(true);

  const sseOverview = useSSE('overview');

  // Load on refresh, mode switch, or custom date change
  useEffect(() => {
    setLoading(true);
    const url = mode === 'custom' && customDate ? `/overview/today?date=${customDate}` : '/overview/today';
    api.get(url)
      .then(res => { setData(res.data); setLoading(false); })
      .catch(err => { toast(err.response?.data?.message || 'Failed to load overview'); setLoading(false); });
  }, [refreshKey, mode, customDate]);

  // SSE push — only in today mode
  useEffect(() => {
    if (mode !== 'today') return;
    if (!sseOverview?.data) return;
    const d = sseOverview.data;
    setData(prev => prev ? {
      ...prev,
      stats:               { ...prev.stats, ...d.stats },
      lateArrivals:        d.lateArrivals        ?? prev.lateArrivals,
      attendanceBreakdown: d.attendanceBreakdown ?? prev.attendanceBreakdown,
      currentlyWorking:    d.currentlyWorking    ?? prev.currentlyWorking,
    } : null);
  }, [sseOverview, mode]);

  // 30-day trend
  useEffect(() => {
    setTrendLoading(true);
    api.get('/attendance/trend?days=30')
      .then(res => setTrend30(res.data.trend || []))
      .catch(() => {})
      .finally(() => setTrendLoading(false));
  }, [refreshKey]);

  // Project health
  useEffect(() => {
    setHealthLoading(true);
    api.get('/overview/project-health')
      .then(res => setProjectHealth(res.data))
      .catch(() => setProjectHealth(null))
      .finally(() => setHealthLoading(false));
  }, [refreshKey]);

  // Top performers
  useEffect(() => {
    setPerfLoading(true);
    api.get('/overview/top-performers')
      .then(res => {
        setPerformers(res.data.performers || []);
        setPerfDays(res.data.workingDays || 0);
      })
      .catch(() => setPerformers([]))
      .finally(() => setPerfLoading(false));
  }, [refreshKey]);

  // Attendance heatmap
  useEffect(() => {
    setHeatmapLoading(true);
    api.get(`/overview/heatmap?year=${heatmapYear}`)
      .then(r => setHeatmap({ data: r.data.data || [], total: r.data.total || 0 }))
      .catch(() => {})
      .finally(() => setHeatmapLoading(false));
  }, [heatmapYear]);

  // Leave calendar
  useEffect(() => {
    setCalLoading(true);
    api.get(`/overview/leave-calendar?year=${calYear}&month=${calMonth}`)
      .then(r => setCalLeaves(r.data.leaves || []))
      .catch(() => setCalLeaves([]))
      .finally(() => setCalLoading(false));
  }, [calYear, calMonth]);

  const prevCalMonth = () => {
    if (calMonth === 1) { setCalMonth(12); setCalYear(y => y - 1); }
    else setCalMonth(m => m - 1);
  };
  const nextCalMonth = () => {
    if (calMonth === 12) { setCalMonth(1); setCalYear(y => y + 1); }
    else setCalMonth(m => m + 1);
  };

  const stats            = data?.stats || {};
  const currentlyWorking = data?.currentlyWorking || { count: 0, list: [] };
  const deptBreakdown    = data?.deptBreakdown || [];

  const donutData = [
    { name: 'Present',  value: data?.attendanceBreakdown?.present  || 0 },
    { name: 'On Leave', value: data?.attendanceBreakdown?.onLeave  || 0 },
    { name: 'Absent',   value: data?.attendanceBreakdown?.absent   || 0 },
  ].filter(d => d.value > 0);

  const healthDonutData = projectHealth ? [
    { name: 'On Track', value: projectHealth.onTrack },
    { name: 'At Risk',  value: projectHealth.atRisk  },
    { name: 'Overdue',  value: projectHealth.overdue },
  ].filter(d => d.value > 0) : [];

  const HEALTH_PIE_COLORS = ['#1D9E75', '#EF9F27', '#E24B4A'];

  // Computed values
  const onTimeCount = stats.present != null && stats.late != null ? Math.max(0, stats.present - stats.late) : 0;

  // Derive sparkline data from 30-day trend (last 7 data points)
  const sparkPresent = useMemo(() =>
    trend30.slice(-7).map(d => ({ v: d.onTime + (d.late || 0) })), [trend30]);
  const sparkLate = useMemo(() =>
    trend30.slice(-7).map(d => ({ v: d.late || 0 })), [trend30]);
  const sparkAbsent = useMemo(() =>
    trend30.slice(-7).map(d => ({ v: d.absent || 0 })), [trend30]);

  // Compute attendance % for donut center
  const attendancePct = stats.total > 0 ? Math.round(((stats.present || 0) / stats.total) * 100) : 0;

  // Average present for reference line on trend chart
  const avgPresent = useMemo(() => {
    if (!trend30.length) return 0;
    const sum = trend30.reduce((s, d) => s + (d.onTime || 0) + (d.late || 0), 0);
    return Math.round(sum / trend30.length);
  }, [trend30]);

  return (
    <div className="space-y-5 fade-up">

      {/* ═══════════════════════════════════════════════════════════════════
           ZONE 1 — Command Center
         ═══════════════════════════════════════════════════════════════════ */}
      <CommandCenter
        mode={mode} onModeChange={handleModeChange}
        customDate={customDate} onCustomDateChange={setCustomDate}
      />

      {/* ═══════════════════════════════════════════════════════════════════
           ZONE 2 — Tab-Specific Content
         ═══════════════════════════════════════════════════════════════════ */}
      <div key={mode + customDate} className="tab-content space-y-5">

        {/* ── 3 KPI Cards — Equal Height Row ─────────────────────────── */}
        <div className="grid-equal-row cols-3 stagger-enter">

          {/* Present Card — with On Time embedded + sparkline */}
          {loading ? (
            <div className="stat-card-enterprise fade-up" style={{ borderTop: '3px solid #1D9E75' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="skeleton h-3 w-28 rounded" />
                <div className="skeleton h-9 w-9 rounded-lg" />
              </div>
              <div className="skeleton h-8 w-16 rounded mb-2" />
              <div className="skeleton h-3 w-32 rounded" />
              <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                <div className="skeleton h-8 w-full rounded" />
              </div>
            </div>
          ) : (
            <div
              className="stat-card-enterprise fade-up"
              style={{ borderTop: '3px solid #1D9E75', cursor: 'pointer' }}
              onClick={() => navigate('/attendance')}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {mode === 'today' ? 'Present Today' : 'Present'}
                </p>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#1D9E7518' }}>
                  <MdPeople size={18} style={{ color: '#1D9E75' }} />
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-1.5">
                <p className="text-[28px] font-bold leading-none" style={{ color: 'var(--text)' }}>
                  {stats.present ?? '—'}
                  {stats.total != null && (
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>/{stats.total}</span>
                  )}
                </p>
                {mode === 'today' && stats.prev && (() => {
                  const diff = (stats.present || 0) - stats.prev.present;
                  const color = diff === 0 ? 'var(--text-muted)' : diff > 0 ? '#1D9E75' : '#E24B4A';
                  return (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: diff === 0 ? 'var(--bg)' : `${color}14`, color }}>
                      {diff === 0 ? '= same' : `${diff > 0 ? '▲ +' : '▼ '}${diff}`}
                    </span>
                  );
                })()}
              </div>
              {/* On Time sub-line with mini ring */}
              <div style={{ marginTop: 4 }}>
                <OnTimeRing onTime={onTimeCount} total={stats.present || 0} />
              </div>
              {/* Sparkline footer */}
              {sparkPresent.length >= 2 && (
                <div className="sparkline-footer">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>7-day trend</span>
                  </div>
                  <MiniSparkline data={sparkPresent} color="#1D9E75" />
                </div>
              )}
            </div>
          )}

          {/* Late Card */}
          <div style={{ cursor: 'pointer' }} onClick={() => navigate('/attendance?status=Late')}>
            <StatCard
              title={mode === 'today' ? 'Late Today' : 'Late'}
              icon={MdAccessTime} color="#EF9F27"
              value={stats.late ?? '—'}
              sub={stats.present ? `of ${stats.present} who clocked in` : 'arrived after office start'}
              loading={loading}
              delta={mode === 'today' && stats.prev ? { diff: (stats.late || 0) - stats.prev.late, invert: true } : null}
              sparkline={sparkLate.length >= 2 ? (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>7-day trend</span>
                  </div>
                  <MiniSparkline data={sparkLate} color="#EF9F27" />
                </div>
              ) : null}
            />
          </div>

          {/* Away Card — Absent + On Leave */}
          {loading ? (
            <div className="stat-card-enterprise fade-up" style={{ borderTop: '3px solid #E24B4A' }}>
              <div className="flex items-center justify-between mb-4">
                <div className="skeleton h-3 w-28 rounded" />
                <div className="skeleton h-9 w-9 rounded-lg" />
              </div>
              <div className="skeleton h-8 w-16 rounded mb-2" />
              <div className="skeleton h-3 w-32 rounded" />
              <div style={{ marginTop: 'auto', paddingTop: 12 }}>
                <div className="skeleton h-8 w-full rounded" />
              </div>
            </div>
          ) : (
            <div
              className="stat-card-enterprise fade-up"
              style={{ borderTop: '3px solid #E24B4A', cursor: 'pointer' }}
              onClick={() => navigate('/attendance?status=Absent')}
            >
              <div className="flex items-start justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  {mode === 'today' ? 'Away Today' : 'Away'}
                </p>
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: '#E24B4A18' }}>
                  <MdPersonOff size={18} style={{ color: '#E24B4A' }} />
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-1.5">
                <p className="text-[28px] font-bold leading-none" style={{ color: 'var(--text)' }}>
                  {stats.absent ?? '—'}
                  {stats.total > 0 && (
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)' }}>/{stats.total}</span>
                  )}
                </p>
                {mode === 'today' && stats.prev && (() => {
                  const diff = (stats.absent || 0) - stats.prev.absent;
                  const color = diff === 0 ? 'var(--text-muted)' : diff > 0 ? '#E24B4A' : '#1D9E75';
                  return (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: diff === 0 ? 'var(--bg)' : `${color}14`, color }}>
                      {diff === 0 ? '= same' : `${diff > 0 ? '▲ +' : '▼ '}${diff}`}
                    </span>
                  );
                })()}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                <span style={{ color: '#8B5CF6', fontWeight: 700 }}>{stats.onLeave ?? 0}</span> approved leaves
                {' · '}
                <span style={{ color: '#E24B4A', fontWeight: 700 }}>{Math.max(0, (stats.absent || 0) - (stats.onLeave || 0))}</span> absent
              </p>
              {/* Sparkline footer */}
              {sparkAbsent.length >= 2 && (
                <div className="sparkline-footer">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600 }}>7-day trend</span>
                  </div>
                  <MiniSparkline data={sparkAbsent} color="#E24B4A" />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Currently Working · Department Breakdown · Attendance Donut ── */}
        <div className="grid-equal-row cols-3 stagger-enter">

          {/* Currently Working — scrollable with avatars */}
          <SectionCard
            title={mode === 'today' ? 'Currently Working' : 'Clocked In'}
            subtitle={mode === 'today' ? 'Clocked in · not yet clocked out'
              : `Who was present on ${customDate ? getShortDate(customDate) : 'this day'}`}
            scrollable
            maxScrollHeight={320}
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {mode === 'today'
                  ? <div style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                      <MdWork size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      Live
                    </div>
                  : <div style={{ background: '#7C3AED14', color: '#7C3AED', borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>
                      Historical
                    </div>
                }
                {!loading && currentlyWorking.count > currentlyWorking.list.length && (
                  <button
                    onClick={() => navigate('/attendance')}
                    className="btn btn-ghost"
                    style={{
                      color: 'var(--primary)', height: 28, padding: '0 10px',
                      fontSize: 12, fontWeight: 700, borderRadius: 999,
                      border: '1px solid var(--primary)',
                      background: 'var(--primary-light)',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    View All
                    <span style={{
                      background: 'var(--primary)', color: '#fff', borderRadius: 999,
                      padding: '1px 6px', fontSize: 10, fontWeight: 800, lineHeight: '16px',
                    }}>
                      +{currentlyWorking.count - currentlyWorking.list.length}
                    </span>
                  </button>
                )}
              </div>
            }
          >
            {loading ? (
              <div className="space-y-3">
                <div className="skeleton h-12 w-20 rounded" />
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
              </div>
            ) : (
              <>
                <p className="text-4xl font-black mb-1" style={{ color: '#1D9E75' }}>
                  {currentlyWorking.count}
                  {stats.present > 0 && (
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-muted)' }}>/{stats.present}</span>
                  )}
                </p>
                {stats.present > 0 && (
                  <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                    of {stats.present} who clocked in today
                  </p>
                )}
                <div className="space-y-1.5">
                  {currentlyWorking.list.length === 0 ? (
                    <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active sessions right now</p>
                  ) : (
                    currentlyWorking.list.map(emp => {
                      const ac = avatarColor(emp.name);
                      return (
                        <div key={emp.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2"
                          style={{ background: 'var(--bg)', border: '1px solid var(--border)', cursor: 'pointer' }}
                          onClick={() => navigate(`/person?id=${emp.id}`)}
                          onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                          onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                          <div className="avatar-initial" style={{ background: ac + '18', color: ac, width: 28, height: 28, fontSize: 10 }}>
                            {getInitials(emp.name)}
                          </div>
                          <span className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text)' }}>{emp.name}</span>
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>since {fmt(emp.clock_in_time)}</span>
                        </div>
                      );
                    })
                  )}
                  {currentlyWorking.count > currentlyWorking.list.length && (
                    <button
                      onClick={() => navigate('/attendance')}
                      style={{
                        width: '100%', marginTop: 8, padding: '8px 0',
                        background: 'var(--primary-light)', color: 'var(--primary)',
                        border: '1px dashed var(--primary)', borderRadius: 8,
                        fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'var(--primary-light)'; e.currentTarget.style.color = 'var(--primary)'; }}
                    >
                      View all +{currentlyWorking.count - currentlyWorking.list.length} employees →
                    </button>
                  )}
                </div>
              </>
            )}
          </SectionCard>

          {/* Department Breakdown — scrollable with stacked bars */}
          <SectionCard
            title="Department Breakdown"
            subtitle={mode === 'today' ? "Today's attendance by team"
              : customDate ? `Attendance on ${getShortDate(customDate)} by team` : 'Attendance by team'}
            scrollable
            maxScrollHeight={320}
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-8 rounded" />)}
              </div>
            ) : deptBreakdown.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No department data</p>
            ) : (
              <table className="dept-table">
                <thead>
                  <tr>
                    {['Department', 'Present', 'Late', 'Absent', 'Rate'].map(h => (
                      <th key={h} style={{
                        textAlign: h === 'Department' ? 'left' : h === 'Rate' ? 'left' : 'center',
                        paddingRight: h === 'Department' ? 8 : 0,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {deptBreakdown.map(dept => (
                    <DeptRow
                      key={dept.department}
                      dept={dept}
                      onClick={dept.id ? () => navigate(`/attendance?dept=${dept.id}`) : undefined}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Attendance Donut — with center metric */}
          <SectionCard
            title={mode === 'today' ? "Today's Attendance" : 'Attendance Breakdown'}
            subtitle="Present · Late · Absent · On Leave"
          >
            {loading ? (
              <div className="skeleton h-44 rounded" />
            ) : donutData.length === 0 ? (
              <div className="text-center py-6" style={{ color: 'var(--text-muted)' }}>
                <p className="text-sm">No attendance data</p>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 260 }}>
                <div style={{ position: 'relative', flex: 1, minHeight: 200 }} className="donut-animate">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData} cx="50%" cy="45%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={3}
                        style={{ cursor: 'pointer' }}
                        onClick={d => {
                          const dest = { Present: '/attendance', 'On Leave': '/attendance?status=Absent', Absent: '/attendance?status=Absent' }[d?.name];
                          if (dest) navigate(dest);
                        }}
                      >
                        {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i]} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} />
                      <Legend content={<DonutLegend />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center metric */}
                  <div className="donut-center" style={{ bottom: 'auto', height: '80%' }}>
                    <p className="donut-center__value">{attendancePct}%</p>
                    <p className="donut-center__label">Attendance</p>
                  </div>
                </div>
              </div>
            )}
          </SectionCard>

        </div>

        {/* ── Late Arrivals & Who's Away ── */}
        <div className="grid-equal-row cols-2 stagger-enter">
          
          {/* Late Arrivals */}
          <SectionCard
            title={mode === 'today' ? 'Late Arrivals Today' : 'Late Arrivals'}
            subtitle={loading ? '' : `${stats.late || 0} employee${stats.late !== 1 ? 's' : ''}`}
            scrollable
            maxScrollHeight={360}
            action={
              !loading && (stats.late || 0) > 0 ? (
                <button onClick={() => navigate('/attendance?status=Late')} className="btn btn-ghost text-xs"
                  style={{ color: 'var(--primary)', height: 28, padding: '0 10px' }}>
                  View All →
                </button>
              ) : null
            }
          >
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex gap-3 items-center">
                    <div className="skeleton h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3 w-32 rounded" />
                      <div className="skeleton h-2.5 w-20 rounded" />
                    </div>
                    <div className="skeleton h-6 w-14 rounded-full" />
                  </div>
                ))}
              </div>
            ) : !data?.lateArrivals?.length ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px' }}>
                  <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
                </svg>
                <p className="text-sm font-medium">All employees arrived on time</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr><th>Employee</th><th>Role</th><th>Clock In</th><th>Delay</th></tr>
                </thead>
                <tbody>
                  {data.lateArrivals.map(row => {
                    const sev = delaySeverity(row.delay_minutes || 0);
                    return (
                      <tr key={row.id} onClick={() => navigate(`/person?id=${row.id}`)} style={{ cursor: 'pointer' }}>
                        <td>
                          <div className="flex items-center gap-2.5">
                            <div className="avatar-initial" style={{ background: avatarColor(row.name) + '18', color: avatarColor(row.name), width: 30, height: 30, fontSize: 10 }}>
                              {getInitials(row.name)}
                            </div>
                            <div>
                              <p className="font-semibold text-[13px]" style={{ color: 'var(--text)', margin: 0 }}>{row.name}</p>
                              <p className="text-[11px]" style={{ color: 'var(--text-muted)', margin: 0 }}>{row.department}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{row.designation || '—'}</td>
                        <td className="font-semibold" style={{ color: 'var(--danger)' }}>{fmt(row.clock_in_time)}</td>
                        <td>
                          {row.delay_minutes > 0
                            ? <span className={`delay-pill ${sev.cls}`}>+{row.delay_minutes}m</span>
                            : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </SectionCard>

          {/* Who's Away */}
          <SectionCard
            title={mode === 'today' ? "Who's Away Today" : 'Who Was Away'}
            subtitle={loading ? '' : `${stats.absent || 0} away · ${stats.onLeave || 0} on leave · ${Math.max(0, (stats.absent || 0) - (stats.onLeave || 0))} no record`}
            scrollable
            maxScrollHeight={360}
            action={
              (stats.absent || 0) > 0 ? (
                <button onClick={() => navigate('/attendance?status=Absent')} className="btn btn-ghost text-xs"
                  style={{ color: 'var(--primary)', height: 28, padding: '0 10px' }}>
                  View All →
                </button>
              ) : null
            }
          >
            {loading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
              </div>
            ) : !(data?.absentList?.length) ? (
              <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto 8px' }}>
                  <circle cx="12" cy="12" r="10" /><polyline points="9 12 11 14 15 10" />
                </svg>
                <p className="text-sm font-medium">Everyone is in today</p>
              </div>
            ) : (
              <div className="space-y-1">
                {data.absentList.slice(0, 8).map(p => {
                  const ac = avatarColor(p.name);
                  return (
                    <div
                      key={p.id}
                      onClick={() => navigate(`/person?id=${p.id}`)}
                      className="flex items-center gap-3 rounded-lg px-2.5 py-2 cursor-pointer"
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                      onMouseLeave={e => e.currentTarget.style.background = ''}
                    >
                      <div className="avatar-initial" style={{ background: ac + '18', color: ac, width: 26, height: 26, fontSize: 9 }}>
                        {getInitials(p.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold truncate" style={{ color: 'var(--text)', margin: 0 }}>{p.name}</p>
                        <p className="text-[11px] truncate" style={{ color: 'var(--text-muted)', margin: 0 }}>{p.department || '—'}</p>
                      </div>
                      {p.onLeave ? (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                          background: '#8B5CF614', color: '#8B5CF6', border: '1px solid #8B5CF633',
                        }}>
                          On Leave{p.leaveType ? ` · ${p.leaveType}` : ''}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                          background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA',
                        }}>
                          No record
                        </span>
                      )}
                    </div>
                  );
                })}
                {(stats.absent || 0) > 8 && (
                  <p className="text-xs text-center pt-1" style={{ color: 'var(--text-muted)' }}>
                    +{(stats.absent || 0) - 8} more — View All
                  </p>
                )}
              </div>
            )}
          </SectionCard>

        </div>

      </div>{/* end Zone 2 tab-content */}


      {/* ═══════════════════════════════════════════════════════════════════
           ZONE 3 — Insights & Analytics (always visible)
         ═══════════════════════════════════════════════════════════════════ */}

      {/* Section divider */}
      <div className="section-divider">
        <div className="section-divider__line" />
        <div className="section-divider__label">
          <MdInsights size={14} style={{ color: 'var(--primary)' }} />
          Insights & Analytics
        </div>
        <div className="section-divider__line" style={{ background: 'linear-gradient(270deg, var(--border) 0%, transparent 100%)' }} />
      </div>

      {/* ── Monthly context strip ──────────────────────────────────────── */}
      {!loading && (stats.monthHours != null || stats.activeProjects != null) && (() => {
        const now = new Date();
        const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
        return (
          <div style={{
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 20px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 6,
          }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 6 }}>
              {monthName}
            </span>
            {stats.monthHours != null && (
              <span
                onClick={() => navigate('/timings')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 10px', borderRadius: 999, background: '#378ADD14', border: '1px solid #378ADD30' }}
              >
                <MdAvTimer size={13} style={{ color: '#378ADD' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#378ADD' }}>{stats.monthHours}h</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>logged this month</span>
              </span>
            )}
            {stats.activeProjects != null && (
              <span
                onClick={() => navigate('/projects')}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 10px', borderRadius: 999, background: '#E24B4A14', border: '1px solid #E24B4A30' }}
              >
                <MdFolderOpen size={13} style={{ color: '#E24B4A' }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#E24B4A' }}>{stats.activeProjects}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>active projects</span>
              </span>
            )}
          </div>
        );
      })()}

      {/* ── 30-day Attendance Trend + Project Health ───────────────────── */}
      <div className="grid-equal-row cols-5-3-2 stagger-enter">

        {/* 30-day Attendance Trend — area chart with average reference line */}
        <SectionCard
          title="30-Day Attendance Trend"
          subtitle="Working days only · weekends & holidays excluded"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <MdTrendingUp size={14} style={{ color: 'var(--primary)' }} />
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Last 30 days</span>
            </div>
          }
        >
          {trendLoading ? (
            <div className="skeleton h-40 rounded" />
          ) : trend30.length === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
              <p className="text-sm">No attendance trend data</p>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend30} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gradOnTime" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#1D9E75" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1D9E75" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gradLate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#EF9F27" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#EF9F27" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="gradAbsent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#E24B4A" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#E24B4A" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <Tooltip content={<TrendTooltip />} cursor={{ stroke: 'var(--border)' }} />
                {avgPresent > 0 && (
                  <ReferenceLine y={avgPresent} stroke="var(--text-muted)" strokeDasharray="4 4" strokeWidth={1}>
                    <label value={`Avg ${avgPresent}`} position="insideTopRight" className="ref-line-label" />
                  </ReferenceLine>
                )}
                <Area type="monotone" dataKey="onTime" name="On Time" stroke="#1D9E75" strokeWidth={2} fill="url(#gradOnTime)" dot={false} />
                <Area type="monotone" dataKey="late"   name="Late"    stroke="#EF9F27" strokeWidth={2} fill="url(#gradLate)"   dot={false} />
                <Area type="monotone" dataKey="absent" name="Absent"  stroke="#E24B4A" strokeWidth={2} fill="url(#gradAbsent)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        {/* Project Health Donut — with center total */}
        <SectionCard
          title="Project Health"
          subtitle="Active projects by deadline status"
          action={
            <button onClick={() => navigate('/projects')} className="btn btn-ghost text-xs"
              style={{ color: 'var(--primary)', height: 28, padding: '0 10px' }}>
              View All →
            </button>
          }
        >
          {healthLoading ? (
            <div className="skeleton h-40 rounded" />
          ) : !projectHealth || projectHealth.total === 0 ? (
            <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>
              <MdFolderOpen size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
              <p className="text-sm">No active projects</p>
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <div style={{ position: 'relative', height: 160 }} className="donut-animate">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={healthDonutData} cx="50%" cy="50%" innerRadius={44} outerRadius={66}
                      dataKey="value" paddingAngle={3}>
                      {healthDonutData.map((_, i) => <Cell key={i} fill={HEALTH_PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <p className="donut-center__value">{projectHealth.total}</p>
                  <p className="donut-center__label">Active</p>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
                {[
                  { label: 'On Track', value: projectHealth.onTrack, color: '#1D9E75' },
                  { label: 'At Risk',  value: projectHealth.atRisk,  color: '#EF9F27' },
                  { label: 'Overdue',  value: projectHealth.overdue, color: '#E24B4A' },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 18, fontWeight: 800, color: item.color, margin: 0 }}>{item.value}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>{item.label}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>


      {/* ── Most Hours Logged ──────────────────────── */}
      <div className="stagger-enter">

        <SectionCard
          title="Most Hours Logged"
          subtitle="This month · attendance clock hours"
          action={<MdAvTimer size={16} style={{ color: '#378ADD' }} />}
          scrollable
          maxScrollHeight={300}
        >
          {perfLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="skeleton h-7 w-7 rounded-full" />
                  <div className="skeleton h-3 flex-1 rounded" />
                  <div className="skeleton h-3 w-10 rounded" />
                </div>
              ))}
            </div>
          ) : performers.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No timesheet data yet</p>
          ) : (
            <div className="space-y-2.5">
              {performers.map((p, i) => (
                <div
                  key={p.id}
                  onClick={() => navigate(`/person?id=${p.id}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderRadius: 8, padding: '5px 6px', margin: '-5px -6px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                  onMouseLeave={e => e.currentTarget.style.background = ''}
                >
                  <RankBadge rank={i} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name}
                  </span>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', margin: 0 }}>
                      {p.total_hours.toFixed(1)}h
                    </p>
                    <p style={{ fontSize: 10, color: p.attendance_pct >= 80 ? '#1D9E75' : p.attendance_pct >= 60 ? '#EF9F27' : '#E24B4A', margin: 0, fontWeight: 600 }}>
                      {perfDays > 0 ? `${p.days_present}/${perfDays}d · ` : ''}{p.attendance_pct}% att.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>

      {/* ── Attendance Heatmap + Leave Calendar ────────────────────────── */}
      <div className="grid-equal-row cols-2 stagger-enter">

        <SectionCard title="Attendance Heatmap" subtitle="Daily team presence — whole year">
          {heatmapLoading
            ? <div className="skeleton h-44 rounded" />
            : <AttendanceHeatmap
                data={heatmap.data}
                total={heatmap.total}
                year={heatmapYear}
                onYearChange={setHeatmapYear}
              />
          }
        </SectionCard>

        <SectionCard title="Leave Calendar" subtitle="Approved leaves — month view">
          {calLoading
            ? <div className="skeleton h-72 rounded" />
            : <LeaveCalendar
                leaves={calLeaves}
                year={calYear}
                month={calMonth}
                onPrev={prevCalMonth}
                onNext={nextCalMonth}
              />
          }
        </SectionCard>

      </div>
    </div>
  );
}

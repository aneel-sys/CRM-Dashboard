import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import {
  MdDownload, MdFilterList, MdDragIndicator, MdVisibility, MdVisibilityOff,
  MdAccessTime, MdCalendarToday, MdSummarize, MdSchedule,
  MdFolderOpen, MdPeople, MdRefresh, MdExpandMore,
  MdTableChart, MdPictureAsPdf, MdDescription,
} from 'react-icons/md';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import api from '../api/axios';
import { useToast } from '../components/Toast';

// ─── Date helpers & quick-apply presets ──────────────────────────────────────

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); }
function firstOfMonth() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10); }
function fmtDateGroup(dateStr) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

const DATE_PRESETS = {
  attendance: [
    { id: 'today',     label: 'Today',         icon: '📅', dates: () => ({ from: todayISO(), to: todayISO() }) },
    { id: 'yesterday', label: 'Yesterday',     icon: '⏪', dates: () => ({ from: daysAgo(1),  to: daysAgo(1) }) },
    { id: '7d',        label: 'Last 7 Days',   icon: '📊', dates: () => ({ from: daysAgo(6),  to: todayISO() }) },
    { id: '30d',       label: 'Last 30 Days',  icon: '📈', dates: () => ({ from: daysAgo(29), to: todayISO() }) },
    { id: '90d',       label: 'Last 90 Days',  icon: '📉', dates: () => ({ from: daysAgo(89), to: todayISO() }) },
    { id: 'year',      label: 'This Year',     icon: '🗓️', dates: () => ({ from: `${new Date().getFullYear()}-01-01`, to: todayISO() }) },
    { id: 'month',     label: 'This Month',    icon: '📋', dates: () => ({ from: firstOfMonth(), to: todayISO() }) },
  ],
  'late-arrivals': [
    { id: 'today',  label: 'Today',         icon: '📅', dates: () => ({ from: todayISO(), to: todayISO() }) },
    { id: '7d',     label: 'Last 7 Days',   icon: '📊', dates: () => ({ from: daysAgo(6),  to: todayISO() }) },
    { id: '30d',    label: 'Last 30 Days',  icon: '📈', dates: () => ({ from: daysAgo(29), to: todayISO() }) },
    { id: '90d',    label: 'Last 90 Days',  icon: '📉', dates: () => ({ from: daysAgo(89), to: todayISO() }) },
    { id: 'year',   label: 'This Year',     icon: '🗓️', dates: () => ({ from: `${new Date().getFullYear()}-01-01`, to: todayISO() }) },
    { id: 'month',  label: 'This Month',    icon: '📋', dates: () => ({ from: firstOfMonth(), to: todayISO() }) },
  ],
  timesheet: [
    { id: '7d',     label: 'Last 7 Days',   icon: '📊', dates: () => ({ from: daysAgo(6),  to: todayISO() }) },
    { id: '30d',    label: 'Last 30 Days',  icon: '📈', dates: () => ({ from: daysAgo(29), to: todayISO() }) },
    { id: '90d',    label: 'Last 90 Days',  icon: '📉', dates: () => ({ from: daysAgo(89), to: todayISO() }) },
    { id: 'year',   label: 'This Year',     icon: '🗓️', dates: () => ({ from: `${new Date().getFullYear()}-01-01`, to: todayISO() }) },
    { id: 'month',  label: 'This Month',    icon: '📋', dates: () => ({ from: firstOfMonth(), to: todayISO() }) },
  ],
};

const DATE_GROUP_TYPES = new Set(['attendance', 'late-arrivals', 'timesheet']);
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function yearOpts() { const y = new Date().getFullYear(); return Array.from({ length: y - 2022 }, (_, i) => 2023 + i); }

function fmtShortRange(from, to) {
  if (!from || !to) return '';
  const f = new Date(from + 'T00:00:00');
  const t = new Date(to + 'T00:00:00');
  const fStr = f.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const tStr = t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  if (from === to) return fStr;
  return `${fStr} – ${tStr}`;
}

// ─── Report type definitions ──────────────────────────────────────────────

const REPORT_TYPES = [
  {
    id: 'attendance',
    label: 'Daily Attendance',
    icon: MdCalendarToday,
    color: '#1D9E75',
    bg: '#ECFDF5',
    description: 'Clock-in/out times, hours worked, delay per employee per day',
  },
  {
    id: 'late-arrivals',
    label: 'Late Arrivals',
    icon: MdAccessTime,
    color: '#EF9F27',
    bg: '#FFFBEB',
    description: 'All late check-ins with delay duration and shift start times',
  },
  {
    id: 'monthly-summary',
    label: 'Monthly Summary',
    icon: MdSummarize,
    color: '#378ADD',
    bg: '#EFF6FF',
    description: 'Per-employee monthly attendance %, days present, total hours',
  },
  {
    id: 'timesheet',
    label: 'Timesheet',
    icon: MdSchedule,
    color: '#8B5CF6',
    bg: '#F5F3FF',
    description: 'Project hours logged per employee across a date range',
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: MdFolderOpen,
    color: '#E24B4A',
    bg: '#FEF2F2',
    description: 'All projects with status, PM, budget, deadline, completion %',
  },
  {
    id: 'team',
    label: 'Team Overview',
    icon: MdPeople,
    color: '#06B6D4',
    bg: '#ECFEFF',
    description: "All active employees with this month's attendance and hours",
  },
];

const COLUMNS_DEF = {
  attendance: [
    { key: 'name',          label: 'Employee',     vis: true },
    { key: 'department',    label: 'Department',   vis: true },
    { key: 'designation',   label: 'Designation',  vis: true },
    { key: 'date',          label: 'Date',         vis: true },
    { key: 'clock_in_fmt',  label: 'Clock In',     vis: true },
    { key: 'clock_out_fmt', label: 'Clock Out',    vis: true },
    { key: 'hours_worked',  label: 'Hours Worked', vis: true },
    { key: 'delay_fmt',     label: 'Delay',        vis: true },
    { key: 'status',        label: 'Status',       vis: true },
  ],
  'late-arrivals': [
    { key: 'date',            label: 'Date',        vis: true },
    { key: 'name',            label: 'Employee',    vis: true },
    { key: 'department',      label: 'Department',  vis: true },
    { key: 'shift_start_fmt', label: 'Shift Start', vis: true },
    { key: 'clock_in_fmt',    label: 'Clock In',    vis: true },
    { key: 'delay_minutes',   label: 'Delay (min)', vis: false },
    { key: 'delay_fmt',       label: 'Delay',       vis: true },
  ],
  'monthly-summary': [
    { key: 'name',           label: 'Employee',      vis: true },
    { key: 'department',     label: 'Department',    vis: true },
    { key: 'designation',    label: 'Designation',   vis: true },
    { key: 'days_present',   label: 'Days Present',  vis: true },
    { key: 'days_absent',    label: 'Days Absent',   vis: true },
    { key: 'days_late',      label: 'Days Late',     vis: true },
    { key: 'attendance_pct', label: 'Attendance %',  vis: true },
    { key: 'total_hours',    label: 'Total Hours',   vis: true },
    { key: 'avg_hours',      label: 'Avg Hrs/Day',   vis: true },
  ],
  timesheet: [
    { key: 'date',     label: 'Date',     vis: true },
    { key: 'employee', label: 'Employee', vis: true },
    { key: 'project',  label: 'Project',  vis: true },
    { key: 'hours',    label: 'Hours',    vis: true },
    { key: 'notes',    label: 'Notes',    vis: true },
  ],
  projects: [
    { key: 'name',           label: 'Project',        vis: true },
    { key: 'short_code',     label: 'Code',           vis: true },
    { key: 'status',         label: 'Status',         vis: true },
    { key: 'pm_name',        label: 'PM',             vis: true },
    { key: 'start_date',     label: 'Start',          vis: true },
    { key: 'deadline',       label: 'Deadline',       vis: true },
    { key: 'days_remaining', label: 'Days Left',      vis: true },
    { key: 'completion_pct', label: 'Completion %',   vis: true },
    { key: 'budget',         label: 'Budget',         vis: true },
    { key: 'health',         label: 'Health',         vis: true },
  ],
  team: [
    { key: 'name',               label: 'Employee',     vis: true },
    { key: 'department',         label: 'Department',   vis: true },
    { key: 'designation',        label: 'Designation',  vis: true },
    { key: 'join_date',          label: 'Join Date',    vis: false },
    { key: 'this_month_present', label: 'Days Present', vis: true },
    { key: 'this_month_late',    label: 'Days Late',    vis: true },
    { key: 'attendance_pct',     label: 'Att. %',       vis: true },
    { key: 'this_month_hours',   label: 'Hours/Month',  vis: true },
  ],
};

// ─── Cell renderers ───────────────────────────────────────────────────────

function StatusPill({ value, type }) {
  const map = {
    'Late':     { bg: '#FEF2F2', color: '#E24B4A' },
    'On Time':  { bg: '#ECFDF5', color: '#1D9E75' },
    'Absent':   { bg: '#F3F4F6', color: '#6B7280' },
    'Overdue':  { bg: '#FEF2F2', color: '#E24B4A' },
    'At Risk':  { bg: '#FFFBEB', color: '#EF9F27' },
    'On Track': { bg: '#ECFDF5', color: '#1D9E75' },
  };
  const s = map[value];
  if (!s) return <span style={{ color: 'var(--text-secondary)' }}>{value || '—'}</span>;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 600,
      background: s.bg,
      color: s.color,
    }}>{value}</span>
  );
}

function ProgressBar({ value }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  const color = pct >= 80 ? '#1D9E75' : pct >= 50 ? '#EF9F27' : '#E24B4A';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 28 }}>{pct}%</span>
    </div>
  );
}

function renderCell(key, value, row) {
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  if (key === 'status' || key === 'health') return <StatusPill value={value} />;
  if (key === 'completion_pct') return <ProgressBar value={value} />;
  if (key === 'attendance_pct') {
    const present = row?.this_month_present ?? row?.days_present;
    const base = row?.working_days;
    return (
      <span style={{ fontWeight: 600, color: value >= 80 ? '#1D9E75' : value >= 60 ? '#EF9F27' : '#E24B4A' }}>
        {value}%
        {present !== undefined && base > 0 && (
          <span style={{ fontWeight: 500, color: 'var(--text-muted)', marginLeft: 5, fontSize: 11 }}>
            ({present}/{base}d)
          </span>
        )}
      </span>
    );
  }
  if (key === 'hours_worked' || key === 'hours' || key === 'total_hours' || key === 'avg_hours' || key === 'this_month_hours') {
    const n = parseFloat(value);
    return <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{isNaN(n) ? value : `${n}h`}</span>;
  }
  if (key === 'budget') {
    const n = parseFloat(value);
    return <span>{isNaN(n) ? value : `₹${n.toLocaleString('en-IN')}`}</span>;
  }
  if (key === 'delay_fmt' || key === 'delay_minutes') {
    return value === '—' || !value
      ? <span style={{ color: 'var(--text-muted)' }}>—</span>
      : <span style={{ color: '#EF9F27', fontWeight: 600 }}>{value}</span>;
  }
  if (key === 'days_remaining') {
    const n = Number(value);
    const color = n < 0 ? '#E24B4A' : n <= 7 ? '#EF9F27' : 'var(--text-secondary)';
    return <span style={{ color, fontWeight: n < 0 ? 700 : 400 }}>{n < 0 ? `${Math.abs(n)}d overdue` : `${n}d`}</span>;
  }
  return <span style={{ color: 'var(--text-secondary)' }}>{String(value)}</span>;
}

// ─── Drag-sortable column pill ────────────────────────────────────────────

function ColumnPill({ col, index, onToggle, onDragStart, onDragOver, onDrop }) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => onDrop(index)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 8px 4px 4px',
        borderRadius: 6,
        border: `1px solid ${col.vis ? 'var(--primary)' : 'var(--border)'}`,
        background: col.vis ? 'var(--bg)' : 'transparent',
        cursor: 'grab',
        userSelect: 'none',
        fontSize: 12,
        color: col.vis ? 'var(--text)' : 'var(--text-muted)',
        transition: 'opacity 0.15s',
      }}
    >
      <MdDragIndicator size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      <span style={{ fontWeight: col.vis ? 600 : 400 }}>{col.label}</span>
      <button
        onClick={() => onToggle(index)}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: col.vis ? 'var(--primary)' : 'var(--text-muted)', lineHeight: 0 }}
      >
        {col.vis ? <MdVisibility size={13} /> : <MdVisibilityOff size={13} />}
      </button>
    </div>
  );
}

// ─── Filter bars per report type ──────────────────────────────────────────

function AttendanceFilters({ filters, setFilters, departments, employees }) {
  return (
    <>
      <DateRange filters={filters} setFilters={setFilters} />
      <DeptSelect departments={departments} value={filters.department_id || ''} onChange={v => setFilters(f => ({ ...f, department_id: v }))} />
      <EmployeeSelect employees={employees} value={filters.user_id || ''} onChange={v => setFilters(f => ({ ...f, user_id: v }))} />
      <div>
        <label style={labelStyle}>Status</label>
        <select value={filters.status || ''} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="form-input form-select" style={{ paddingRight: 28 }}>
          <option value="">All</option>
          <option>On Time</option>
          <option>Late</option>
        </select>
      </div>
    </>
  );
}

function LateArrivalsFilters({ filters, setFilters, departments, employees }) {
  return (
    <>
      <DateRange filters={filters} setFilters={setFilters} />
      <DeptSelect departments={departments} value={filters.department_id || ''} onChange={v => setFilters(f => ({ ...f, department_id: v }))} />
      <EmployeeSelect employees={employees} value={filters.user_id || ''} onChange={v => setFilters(f => ({ ...f, user_id: v }))} />
      <div>
        <label style={labelStyle}>Min Delay</label>
        <select value={filters.min_delay || ''} onChange={e => setFilters(f => ({ ...f, min_delay: e.target.value }))} className="form-input form-select" style={{ paddingRight: 28, minWidth: 130 }}>
          <option value="">Any delay</option>
          <option value="15">&gt; 15 minutes</option>
          <option value="30">&gt; 30 minutes</option>
          <option value="60">&gt; 1 hour</option>
          <option value="120">&gt; 2 hours</option>
        </select>
      </div>
    </>
  );
}

function MonthlySummaryFilters({ filters, setFilters, departments }) {
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  return (
    <>
      <div>
        <label style={labelStyle}>Month</label>
        <select value={filters.month || curMonth} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
          className="form-input form-select" style={{ paddingRight: 28, minWidth: 130 }}>
          {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Year</label>
        <select value={filters.year || curYear} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}
          className="form-input form-select" style={{ paddingRight: 28 }}>
          {yearOpts().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <DeptSelect departments={departments} value={filters.department_id || ''} onChange={v => setFilters(f => ({ ...f, department_id: v }))} />
      <div>
        <label style={labelStyle}>Attendance</label>
        <select value={filters.att_threshold || ''} onChange={e => setFilters(f => ({ ...f, att_threshold: e.target.value }))}
          className="form-input form-select" style={{ paddingRight: 28, minWidth: 145 }}>
          <option value="">All Employees</option>
          <option value="75">Below 75%</option>
          <option value="50">Below 50%</option>
          <option value="100">Perfect (100%)</option>
        </select>
      </div>
    </>
  );
}

function TimesheetFilters({ filters, setFilters, employees, projects }) {
  return (
    <>
      <DateRange filters={filters} setFilters={setFilters} />
      <EmployeeSelect employees={employees} value={filters.user_id || ''} onChange={v => setFilters(f => ({ ...f, user_id: v }))} />
      <div>
        <label style={labelStyle}>Project</label>
        <select value={filters.project_id || ''} onChange={e => setFilters(f => ({ ...f, project_id: e.target.value }))} className="form-input form-select" style={{ paddingRight: 28 }}>
          <option value="">All Projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
    </>
  );
}

function ProjectsFilters({ filters, setFilters }) {
  return (
    <>
      <div>
        <label style={labelStyle}>Status</label>
        <select value={filters.status || ''} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="form-input form-select" style={{ paddingRight: 28, minWidth: 130 }}>
          <option value="">All Statuses</option>
          <option value="not started">Not Started</option>
          <option value="in progress">In Progress</option>
          <option value="on hold">On Hold</option>
          <option value="finished">Finished</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <div>
        <label style={labelStyle}>Health</label>
        <select value={filters.health || ''} onChange={e => setFilters(f => ({ ...f, health: e.target.value }))} className="form-input form-select" style={{ paddingRight: 28, minWidth: 120 }}>
          <option value="">All</option>
          <option value="On Track">On Track</option>
          <option value="At Risk">At Risk</option>
          <option value="Overdue">Overdue</option>
        </select>
      </div>
    </>
  );
}

function TeamFilters({ filters, setFilters, departments }) {
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  return (
    <>
      <div>
        <label style={labelStyle}>Month</label>
        <select value={filters.month || curMonth} onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
          className="form-input form-select" style={{ paddingRight: 28, minWidth: 130 }}>
          {MONTH_NAMES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Year</label>
        <select value={filters.year || curYear} onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}
          className="form-input form-select" style={{ paddingRight: 28 }}>
          {yearOpts().map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      <DeptSelect departments={departments} value={filters.department_id || ''} onChange={v => setFilters(f => ({ ...f, department_id: v }))} />
      <div>
        <label style={labelStyle}>Show</label>
        <select value={filters.att_threshold || ''} onChange={e => setFilters(f => ({ ...f, att_threshold: e.target.value }))}
          className="form-input form-select" style={{ paddingRight: 28, minWidth: 165 }}>
          <option value="">All Employees</option>
          <option value="75">Below 75% attendance</option>
          <option value="50">Below 50% attendance</option>
        </select>
      </div>
    </>
  );
}

// helpers
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 6, color: 'var(--text-secondary)' };

function DateRange({ filters, setFilters }) {
  const today = new Date().toISOString().slice(0, 10);
  const first = new Date(); first.setDate(1);
  const firstDay = first.toISOString().slice(0, 10);
  return (
    <>
      <div>
        <label style={labelStyle}>From</label>
        <input type="date" value={filters.from || firstDay} onChange={e => setFilters(f => ({ ...f, from: e.target.value }))} className="form-input" />
      </div>
      <div>
        <label style={labelStyle}>To</label>
        <input type="date" value={filters.to || today} onChange={e => setFilters(f => ({ ...f, to: e.target.value }))} className="form-input" />
      </div>
    </>
  );
}

function DeptSelect({ departments, value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>Department</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="form-input form-select" style={{ paddingRight: 28 }}>
        <option value="">All Departments</option>
        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select>
    </div>
  );
}

function EmployeeSelect({ employees, value, onChange }) {
  return (
    <div>
      <label style={labelStyle}>Employee</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="form-input form-select" style={{ paddingRight: 28 }}>
        <option value="">All Employees</option>
        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
      </select>
    </div>
  );
}

const FILTERS_COMPONENT = {
  attendance:       AttendanceFilters,
  'late-arrivals':  LateArrivalsFilters,
  'monthly-summary':MonthlySummaryFilters,
  timesheet:        TimesheetFilters,
  projects:         ProjectsFilters,
  team:             TeamFilters,
};

// ─── Main page component ──────────────────────────────────────────────────

export default function Reports() {
  const { refreshKey } = useOutletContext();
  const toast = useToast();
  const navigate = useNavigate();

  const [activeType, setActiveType]   = useState('attendance');
  const [filters, setFilters]         = useState({});
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [exporting, setExporting]     = useState(false);
  const [meta, setMeta]               = useState({});
  const [columns, setColumns]         = useState(COLUMNS_DEF.attendance.map(c => ({ ...c })));
  const [filterMeta, setFilterMeta]   = useState({ departments: [], employees: [], projects: [] });
  const [colPanelOpen, setColPanelOpen] = useState(false);
  const [page, setPage]               = useState(1);
  const PER_PAGE = 100;

  const dragIdx = useRef(null);

  // Load filter options once
  useEffect(() => {
    api.get('/reports/filters')
      .then(r => setFilterMeta(r.data))
      .catch(() => {});
  }, []);

  // Reset columns + rows when type changes
  useEffect(() => {
    setColumns(COLUMNS_DEF[activeType].map(c => ({ ...c })));
    setRows([]);
    setMeta({});
    setPage(1);
    setFilters({});
  }, [activeType]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(Object.entries(filters).filter(([, v]) => v));
      const res = await api.get(`/reports/${activeType}?${params}`);
      setRows(res.data.rows || []);
      setMeta(res.data);
      setPage(1);
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to load report');
    } finally { setLoading(false); }
  }, [activeType, filters]);

  const handleQuickApply = useCallback(async (extraFilters) => {
    const newFilters = { ...filters, ...extraFilters };
    setFilters(newFilters);
    setLoading(true);
    setPage(1);
    try {
      const params = new URLSearchParams(Object.entries(newFilters).filter(([, v]) => v));
      const res = await api.get(`/reports/${activeType}?${params}`);
      setRows(res.data.rows || []);
      setMeta(res.data);
    } catch (err) {
      toast(err.response?.data?.message || 'Failed to load report');
    } finally { setLoading(false); }
  }, [activeType, filters]);

  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const handleExportExcel = async () => {
    const visKeys = columns.filter(c => c.vis).map(c => c.key);
    const params  = new URLSearchParams({
      type: activeType,
      cols: visKeys.join(','),
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    });
    setExporting(true);
    setExportMenuOpen(false);
    try {
      const res = await fetch(`/api/reports/export?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error((await res.json()).message || 'Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const cd   = res.headers.get('Content-Disposition') || '';
      const m    = cd.match(/filename="(.+?)"/);
      a.href     = url;
      a.download = m ? m[1] : 'Report.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast(err.message || 'Export failed'); }
    finally { setExporting(false); }
  };

  const handleExportCSV = () => {
    setExportMenuOpen(false);
    const visCols = columns.filter(c => c.vis);
    const escape  = v => {
      const s = (v === null || v === undefined) ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = visCols.map(c => escape(c.label)).join(',');
    let bodyLines;
    if (DATE_GROUP_TYPES.has(activeType)) {
      bodyLines = [];
      let lastDate = null;
      rows.forEach(row => {
        if (row.date !== lastDate) {
          lastDate = row.date;
          bodyLines.push(escape(fmtDateGroup(row.date)));
        }
        bodyLines.push(visCols.map(c => escape(row[c.key] ?? '')).join(','));
      });
    } else {
      bodyLines = rows.map(row => visCols.map(c => escape(row[c.key] ?? '')).join(','));
    }
    const csv    = '﻿' + header + '\n' + bodyLines.join('\n');
    const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    const label  = REPORT_TYPES.find(r => r.id === activeType)?.label || 'Report';
    a.href       = url;
    a.download   = `${label.replace(/ /g,'_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    setExportMenuOpen(false);
    const visCols  = columns.filter(c => c.vis);
    const label    = REPORT_TYPES.find(r => r.id === activeType)?.label || 'Report';
    const period   = filters.from && filters.to
      ? `${filters.from} to ${filters.to}`
      : filters.month
        ? `${String(filters.month).padStart(2,'0')}/${filters.year || new Date().getFullYear()}`
        : `As of ${new Date().toLocaleDateString('en-IN')}`;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

    // Header block
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(17, 24, 39);
    doc.text(label, 40, 40);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(107, 114, 128);
    doc.text(period, 40, 56);
    doc.text(`${rows.length} record${rows.length !== 1 ? 's' : ''}`, 40, 69);

    // Table body — grouped by date for date-range reports
    let pdfBody;
    if (DATE_GROUP_TYPES.has(activeType)) {
      pdfBody = [];
      let lastDate = null;
      rows.forEach(row => {
        if (row.date !== lastDate) {
          lastDate = row.date;
          pdfBody.push([{
            content: fmtDateGroup(row.date),
            colSpan: visCols.length,
            styles: { fillColor: [243, 244, 246], fontStyle: 'bold', textColor: [55, 65, 81], fontSize: 8 },
          }]);
        }
        pdfBody.push(visCols.map(c => {
          const v = row[c.key];
          if (v === null || v === undefined || v === '') return '—';
          return String(v);
        }));
      });
    } else {
      pdfBody = rows.map(row => visCols.map(c => {
        const v = row[c.key];
        if (v === null || v === undefined || v === '') return '—';
        return String(v);
      }));
    }

    // Table
    autoTable(doc, {
      startY: 82,
      head: [visCols.map(c => c.label)],
      body: pdfBody,
      styles: {
        fontSize: 8,
        cellPadding: 4,
        overflow: 'linebreak',
        textColor: [31, 41, 55],
      },
      headStyles: {
        fillColor: [29, 158, 117],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      margin: { left: 40, right: 40 },
      tableLineColor: [229, 231, 235],
      tableLineWidth: 0.3,
    });

    // Footer on each page
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(156, 163, 175);
      doc.text(
        `WorkDash · ${label} · Page ${i} of ${pageCount}`,
        doc.internal.pageSize.getWidth() / 2,
        doc.internal.pageSize.getHeight() - 16,
        { align: 'center' }
      );
    }

    doc.save(`${label.replace(/ /g,'_')}_${period.slice(0,10)}.pdf`);
  };

  // Column drag handlers
  const handleDragStart = i => { dragIdx.current = i; };
  const handleDragOver  = i => {
    if (dragIdx.current === null || dragIdx.current === i) return;
    setColumns(cols => {
      const next = [...cols];
      const [moved] = next.splice(dragIdx.current, 1);
      next.splice(i, 0, moved);
      dragIdx.current = i;
      return next;
    });
  };
  const handleDrop   = () => { dragIdx.current = null; };
  const toggleCol    = i => setColumns(cols => cols.map((c, ci) => ci === i ? { ...c, vis: !c.vis } : c));

  const visibleCols  = columns.filter(c => c.vis);
  const paged        = rows.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages   = Math.ceil(rows.length / PER_PAGE);

  const FilterBar = FILTERS_COMPONENT[activeType];
  const activeReport = REPORT_TYPES.find(r => r.id === activeType);

  return (
    <div className="space-y-5 fade-up">

      {/* Report type selector */}
      <div className="card p-4">
        <p className="section-title mb-3">Select Report</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {REPORT_TYPES.map(rt => {
            const Icon = rt.icon;
            const active = rt.id === activeType;
            return (
              <button
                key={rt.id}
                onClick={() => setActiveType(rt.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  padding: '12px 14px',
                  borderRadius: 10,
                  border: `2px solid ${active ? rt.color : 'var(--border)'}`,
                  background: active ? rt.bg : 'var(--card)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8,
                    background: active ? rt.color : 'var(--bg)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <Icon size={16} style={{ color: active ? '#fff' : rt.color }} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: active ? rt.color : 'var(--text)' }}>
                    {rt.label}
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0, lineHeight: 1.4 }}>
                  {rt.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filter bar + actions */}
      <div className="card px-5 py-4">
        {DATE_PRESETS[activeType] && (
          <div className="quick-range-bar">
            {DATE_PRESETS[activeType].map(p => {
              const dates = p.dates();
              const isActive = filters.from === dates.from && filters.to === dates.to;
              return (
                <button
                  key={p.id}
                  onClick={() => handleQuickApply(dates)}
                  className={`quick-range-btn ${isActive ? 'quick-range-btn--active' : ''}`}
                >
                  <span>{p.label}</span>
                  {isActive && (
                    <span className="quick-range-btn__date">
                      {fmtShortRange(dates.from, dates.to)}
                    </span>
                  )}
                </button>
              );
            })}
            {/* Custom Range toggle */}
            <button
              onClick={() => {
                // If custom is already selected (no preset match), clear to show pickers
                // Otherwise just ensure the date inputs are visible
                setFilters(f => ({ ...f, _customRange: !f._customRange }));
              }}
              className={`quick-range-btn ${filters._customRange ? 'quick-range-btn--active' : ''}`}
              style={filters._customRange ? { background: '#7C3AED', borderColor: '#7C3AED', color: '#fff', boxShadow: '0 2px 8px rgba(124,58,237,0.25)' } : {}}
            >
              <MdCalendarToday size={14} />
              Custom Range
            </button>
          </div>
        )}

        {/* Custom Range date pickers — visible when toggled */}
        {filters._customRange && DATE_PRESETS[activeType] && (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
            padding: '12px 0', marginBottom: 12,
            borderBottom: '1px solid var(--border)',
            animation: 'tabSlideIn 0.2s ease-out both',
          }}>
            <div>
              <label style={labelStyle}>From Date</label>
              <input
                type="date"
                value={filters.from || new Date().toISOString().slice(0, 10)}
                onChange={e => setFilters(f => ({ ...f, from: e.target.value }))}
                className="form-input"
                style={{ minWidth: 150 }}
              />
            </div>
            <div>
              <label style={labelStyle}>To Date</label>
              <input
                type="date"
                value={filters.to || new Date().toISOString().slice(0, 10)}
                onChange={e => setFilters(f => ({ ...f, to: e.target.value }))}
                className="form-input"
                style={{ minWidth: 150 }}
              />
            </div>
            <button
              onClick={() => {
                fetchData();
              }}
              className="btn btn-primary"
              style={{ height: 36 }}
            >
              Apply Range
            </button>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <FilterBar
            filters={filters}
            setFilters={setFilters}
            departments={filterMeta.departments}
            employees={filterMeta.employees}
            projects={filterMeta.projects}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button onClick={fetchData} className="btn btn-primary" style={{ height: 36 }}>
              <MdFilterList size={15} /> Run Report
            </button>

            {/* Export dropdown */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setExportMenuOpen(o => !o)}
                disabled={exporting || rows.length === 0}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 36, padding: '0 14px', borderRadius: 8,
                  border: 'none',
                  background: rows.length === 0 ? 'var(--border)' : '#1D9E75',
                  color: rows.length === 0 ? 'var(--text-muted)' : '#fff',
                  fontWeight: 600, fontSize: 13, cursor: rows.length === 0 ? 'default' : 'pointer',
                  opacity: exporting ? 0.7 : 1,
                }}
              >
                <MdDownload size={16} />
                {exporting ? 'Generating…' : 'Export'}
                <MdExpandMore size={16} style={{ marginLeft: 2 }} />
              </button>

              {exportMenuOpen && rows.length > 0 && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setExportMenuOpen(false)} />
                  <div style={{
                    position: 'absolute', right: 0, top: 40, zIndex: 50,
                    background: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 10, boxShadow: 'var(--card-shadow-md)',
                    overflow: 'hidden', minWidth: 180,
                  }}>
                    {[
                      { label: 'Excel (.xlsx)', sub: 'Formatted spreadsheet', icon: MdTableChart,    color: '#1D9E75', action: handleExportExcel },
                      { label: 'PDF (.pdf)',    sub: 'Printable document',    icon: MdPictureAsPdf,  color: '#E24B4A', action: handleExportPDF   },
                      { label: 'CSV (.csv)',    sub: 'Raw data / any app',    icon: MdDescription,   color: '#378ADD', action: handleExportCSV   },
                    ].map(opt => {
                      const Icon = opt.icon;
                      return (
                      <button
                        key={opt.label}
                        onClick={opt.action}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          width: '100%', padding: '10px 14px',
                          background: 'transparent', border: 'none',
                          borderBottom: '1px solid var(--border)',
                          cursor: 'pointer', textAlign: 'left',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                          background: `${opt.color}18`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Icon size={17} style={{ color: opt.color }} />
                        </div>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{opt.label}</p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{opt.sub}</p>
                        </div>
                      </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Column configurator */}
      {rows.length > 0 && (
        <div className="card px-5 py-3">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setColPanelOpen(o => !o)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              <MdVisibility size={14} />
              Columns ({visibleCols.length}/{columns.length})
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {colPanelOpen ? '▲' : '▼'}
              </span>
            </button>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Drag to reorder · toggle visibility · changes apply to Excel export
            </span>
          </div>
          {colPanelOpen && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {columns.map((col, i) => (
                <ColumnPill
                  key={col.key}
                  col={col}
                  index={i}
                  onToggle={toggleCol}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Results table */}
      <div className="card overflow-hidden">
        {/* Table header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <p className="section-title">
              {activeReport?.label}
            </p>
            <p className="section-sub">
              {loading ? 'Loading…'
                : rows.length === 0 ? 'Run the report to see data'
                : `${rows.length.toLocaleString()} records${meta.workingDays ? ` · ${meta.workingDays} working days` : ''}`}
            </p>
          </div>
          {rows.length > 0 && (
            <button
              onClick={fetchData}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: 'var(--text-muted)', background: 'none',
                border: '1px solid var(--border)', borderRadius: 6,
                padding: '4px 10px', cursor: 'pointer',
              }}
            >
              <MdRefresh size={13} /> Refresh
            </button>
          )}
        </div>

        {/* Skeleton */}
        {loading && (
          <div style={{ padding: '24px 20px' }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 36, marginBottom: 8, borderRadius: 6 }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && rows.length === 0 && (
          <div style={{ padding: 48, textAlign: 'center' }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: activeReport?.bg || 'var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              {activeReport && <activeReport.icon size={22} style={{ color: activeReport.color }} />}
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
              No data yet
            </p>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              Select filters above and click <strong>Run Report</strong>
            </p>
          </div>
        )}

        {/* Data table */}
        {!loading && rows.length > 0 && (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg)' }}>
                    {visibleCols.map(col => (
                      <th key={col.key} style={{
                        padding: '10px 14px',
                        textAlign: 'left',
                        fontWeight: 600,
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                        borderBottom: '1px solid var(--border)',
                      }}>
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const grouped = DATE_GROUP_TYPES.has(activeType);
                    let lastDate = null;
                    let dataRowIdx = 0;
                    return paged.map((row, i) => {
                      const cells = visibleCols.map(col => {
                        let content;
                        if ((col.key === 'name' || col.key === 'employee') && (row.id || row.user_id)) {
                          const uid = row.id || row.user_id;
                          content = (
                            <span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                              onClick={() => navigate(`/person?id=${uid}`)}>
                              {row[col.key]}
                            </span>
                          );
                        } else {
                          content = renderCell(col.key, row[col.key], row);
                        }
                        return (
                          <td key={col.key} style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                            {content}
                          </td>
                        );
                      });
                      const dataRow = (
                        <tr key={`r-${i}`}
                          style={{ borderBottom: '1px solid var(--border)', background: dataRowIdx % 2 === 1 ? 'var(--bg)' : 'transparent' }}>
                          {cells}
                        </tr>
                      );
                      dataRowIdx++;
                      if (grouped && row.date !== lastDate) {
                        lastDate = row.date;
                        dataRowIdx = 0;
                        return [
                          <tr key={`d-${row.date}-${i}`}>
                            <td colSpan={visibleCols.length} style={{
                              padding: '7px 14px',
                              background: 'var(--bg)',
                              fontWeight: 700,
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              borderTop: i > 0 ? '2px solid var(--border)' : undefined,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em',
                            }}>
                              {fmtDateGroup(row.date)}
                            </td>
                          </tr>,
                          dataRow,
                        ];
                      }
                      return dataRow;
                    });
                  })()}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 20px', borderTop: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, rows.length)} of {rows.length}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    style={pgBtn(page === 1)}
                  >← Prev</button>
                  {[...Array(Math.min(7, totalPages))].map((_, i) => {
                    let p;
                    if (totalPages <= 7) p = i + 1;
                    else if (page <= 4) p = i + 1;
                    else if (page >= totalPages - 3) p = totalPages - 6 + i;
                    else p = page - 3 + i;
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        style={pgBtn(false, p === page)}
                      >{p}</button>
                    );
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    style={pgBtn(page === totalPages)}
                  >Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function pgBtn(disabled, active) {
  return {
    padding: '4px 10px',
    borderRadius: 6,
    border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
    background: active ? 'var(--primary)' : 'var(--card)',
    color: active ? '#fff' : disabled ? 'var(--text-muted)' : 'var(--text)',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}

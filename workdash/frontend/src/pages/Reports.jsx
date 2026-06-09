import { useState, useEffect, useRef, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  MdDownload, MdFilterList, MdDragIndicator, MdVisibility, MdVisibilityOff,
  MdAccessTime, MdCalendarToday, MdSummarize, MdSchedule,
  MdFolderOpen, MdPeople, MdRefresh,
} from 'react-icons/md';
import api from '../api/axios';
import { useToast } from '../components/Toast';

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

function renderCell(key, value) {
  if (value === null || value === undefined || value === '') return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  if (key === 'status' || key === 'health') return <StatusPill value={value} />;
  if (key === 'completion_pct') return <ProgressBar value={value} />;
  if (key === 'attendance_pct') return (
    <span style={{ fontWeight: 600, color: value >= 80 ? '#1D9E75' : value >= 60 ? '#EF9F27' : '#E24B4A' }}>
      {value}%
    </span>
  );
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
          <option>Absent</option>
        </select>
      </div>
    </>
  );
}

function LateArrivalsFilters({ filters, setFilters, departments }) {
  return (
    <>
      <DateRange filters={filters} setFilters={setFilters} />
      <DeptSelect departments={departments} value={filters.department_id || ''} onChange={v => setFilters(f => ({ ...f, department_id: v }))} />
    </>
  );
}

function MonthlySummaryFilters({ filters, setFilters, departments }) {
  const now = new Date();
  return (
    <>
      <div>
        <label style={labelStyle}>Month</label>
        <input type="number" min={1} max={12} value={filters.month || now.getMonth() + 1}
          onChange={e => setFilters(f => ({ ...f, month: e.target.value }))}
          className="form-input" style={{ width: 70 }} />
      </div>
      <div>
        <label style={labelStyle}>Year</label>
        <input type="number" min={2020} max={2099} value={filters.year || now.getFullYear()}
          onChange={e => setFilters(f => ({ ...f, year: e.target.value }))}
          className="form-input" style={{ width: 88 }} />
      </div>
      <DeptSelect departments={departments} value={filters.department_id || ''} onChange={v => setFilters(f => ({ ...f, department_id: v }))} />
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
    <div>
      <label style={labelStyle}>Status</label>
      <select value={filters.status || ''} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))} className="form-input form-select" style={{ paddingRight: 28 }}>
        <option value="">All Statuses</option>
        <option value="not started">Not Started</option>
        <option value="in progress">In Progress</option>
        <option value="on hold">On Hold</option>
        <option value="finished">Finished</option>
        <option value="cancelled">Cancelled</option>
      </select>
    </div>
  );
}

function TeamFilters({ filters, setFilters, departments }) {
  return <DeptSelect departments={departments} value={filters.department_id || ''} onChange={v => setFilters(f => ({ ...f, department_id: v }))} />;
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

  const handleExport = async () => {
    const visKeys = columns.filter(c => c.vis).map(c => c.key);
    const params  = new URLSearchParams({
      type: activeType,
      cols: visKeys.join(','),
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    });
    setExporting(true);
    try {
      const res = await fetch(`/api/reports/export?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error((await res.json()).message || 'Export failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const cd   = res.headers.get('Content-Disposition') || '';
      const m    = cd.match(/filename="(.+?)"/);
      a.href     = url;
      a.download = m ? m[1] : `Report.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) { toast(err.message || 'Export failed'); }
    finally { setExporting(false); }
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
            <button
              onClick={handleExport}
              disabled={exporting || rows.length === 0}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                height: 36, padding: '0 14px', borderRadius: 8,
                border: 'none',
                background: rows.length === 0 ? 'var(--border)' : '#1D9E75',
                color: rows.length === 0 ? 'var(--text-muted)' : '#fff',
                fontWeight: 600, fontSize: 13, cursor: rows.length === 0 ? 'default' : 'pointer',
                transition: 'opacity 0.15s',
                opacity: exporting ? 0.7 : 1,
              }}
            >
              <MdDownload size={16} />
              {exporting ? 'Generating…' : 'Download Excel'}
            </button>
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
                  {paged.map((row, i) => (
                    <tr
                      key={i}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: i % 2 === 1 ? 'var(--bg)' : 'transparent',
                      }}
                    >
                      {visibleCols.map(col => (
                        <td key={col.key} style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                          {renderCell(col.key, row[col.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
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

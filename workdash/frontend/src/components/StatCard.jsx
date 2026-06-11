// delta: { diff: number, invert?: boolean } — ▲/▼ vs previous working day.
// invert=true means an increase is bad (late, absent) and renders red.
function DeltaChip({ diff, invert }) {
  if (diff === 0) {
    return (
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
        style={{ background: 'var(--bg)', color: 'var(--text-muted)' }}>
        = same
      </span>
    );
  }
  const up   = diff > 0;
  const good = invert ? !up : up;
  const color = good ? '#1D9E75' : '#E24B4A';
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: `${color}14`, color }}>
      {up ? '▲' : '▼'} {up ? '+' : ''}{diff}
    </span>
  );
}

export default function StatCard({ title, value, sub, icon: Icon, color = '#1D9E75', accent, loading, delta }) {
  const accentColor = accent || color;

  if (loading) {
    return (
      <div className="card p-5 fade-up">
        <div className="flex items-center justify-between mb-4">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton h-9 w-9 rounded-lg" />
        </div>
        <div className="skeleton h-8 w-20 rounded mb-2" />
        <div className="skeleton h-3 w-24 rounded" />
      </div>
    );
  }

  return (
    <div
      className="card p-5 fade-up hover:shadow-md transition-shadow duration-200 relative overflow-hidden"
      style={{ borderTop: `3px solid ${accentColor}` }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          {title}
        </p>
        {Icon && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${accentColor}18` }}
          >
            <Icon size={18} style={{ color: accentColor }} />
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-1.5">
        <p className="text-[28px] font-bold leading-none" style={{ color: 'var(--text)' }}>
          {value ?? <span className="text-[var(--text-muted)]">—</span>}
        </p>
        {delta && <DeltaChip diff={delta.diff} invert={delta.invert} />}
      </div>

      {sub && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>
      )}
    </div>
  );
}

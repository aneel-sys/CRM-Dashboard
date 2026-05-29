export default function StatCard({ title, value, sub, icon: Icon, color = '#1D9E75', accent, loading }) {
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

      <p className="text-[28px] font-bold leading-none mb-1.5" style={{ color: 'var(--text)' }}>
        {value ?? <span className="text-[var(--text-muted)]">—</span>}
      </p>

      {sub && (
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{sub}</p>
      )}
    </div>
  );
}

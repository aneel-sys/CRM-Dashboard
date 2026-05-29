export default function StatCard({ title, value, sub, icon: Icon, color = '#1D9E75', loading }) {
  if (loading) {
    return (
      <div className="bg-[var(--color-card)] rounded-xl p-5 border border-[var(--color-border)] fade-in">
        <div className="skeleton h-3 w-24 mb-3"></div>
        <div className="skeleton h-8 w-16 mb-2"></div>
        <div className="skeleton h-3 w-20"></div>
      </div>
    );
  }

  return (
    <div className="bg-[var(--color-card)] rounded-xl p-5 border border-[var(--color-border)] fade-in hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wider">{title}</span>
        {Icon && (
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
            <Icon size={18} style={{ color }} />
          </div>
        )}
      </div>
      <div className="text-3xl font-bold text-[var(--color-text)]">{value ?? '—'}</div>
      {sub && <div className="text-xs text-[var(--color-muted)] mt-1">{sub}</div>}
    </div>
  );
}

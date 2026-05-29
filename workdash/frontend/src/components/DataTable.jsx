export default function DataTable({ columns, data, loading, emptyMessage = 'No data found' }) {
  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              {columns.map(c => (
                <th key={c.key} className="text-left py-3 px-4 text-[var(--color-muted)] font-semibold text-xs uppercase tracking-wider">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--color-border)]">
                {columns.map(c => (
                  <td key={c.key} className="py-3 px-4">
                    <div className="skeleton h-4 w-full rounded"></div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-[var(--color-muted)]">
        <span className="text-4xl mb-3">📭</span>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)]">
            {columns.map(c => (
              <th
                key={c.key}
                className="text-left py-3 px-4 text-[var(--color-muted)] font-semibold text-xs uppercase tracking-wider whitespace-nowrap"
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={row.id || i}
              className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors"
            >
              {columns.map(c => (
                <td key={c.key} className="py-3 px-4 text-[var(--color-text)]">
                  {c.render ? c.render(row[c.key], row) : (row[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

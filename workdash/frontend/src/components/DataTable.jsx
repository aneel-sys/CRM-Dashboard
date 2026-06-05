import { useState, useEffect } from 'react';
import { MdChevronLeft, MdChevronRight } from 'react-icons/md';

export default function DataTable({ columns, data, loading, emptyMessage = 'No data found', pageSize = 25 }) {
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [data]);

  if (loading) {
    return (
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: 7 }).map((_, i) => (
              <tr key={i}>
                {columns.map(c => (
                  <td key={c.key}><div className="skeleton h-4 rounded" style={{ width: '80%' }} /></td>
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
      <div className="flex flex-col items-center justify-center py-16" style={{ color: 'var(--text-muted)' }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 10, opacity: 0.35 }}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <p className="text-sm font-medium">{emptyMessage}</p>
      </div>
    );
  }

  const totalPages = Math.ceil(data.length / pageSize);
  const paged = data.slice((page - 1) * pageSize, page * pageSize);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, data.length);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} style={{ textAlign: c.align || 'left' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr key={row.id ?? i} className="fade-in">
                {columns.map(c => (
                  <td key={c.key} style={{ textAlign: c.align || 'left' }}>
                    {c.render ? c.render(row[c.key], row, (page - 1) * pageSize + i) : (row[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderTop: '1px solid var(--border)',
        }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Showing {from}–{to} of {data.length}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--card)', cursor: page === 1 ? 'not-allowed' : 'pointer',
                opacity: page === 1 ? 0.4 : 1, color: 'var(--text)',
              }}
            >
              <MdChevronLeft size={18} />
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) => (
                p === '…' ? (
                  <span key={`ellipsis-${i}`} style={{ padding: '0 4px', fontSize: 12, color: 'var(--text-muted)' }}>…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    style={{
                      width: 30, height: 30, borderRadius: 6, fontSize: 12, fontWeight: p === page ? 700 : 500,
                      border: `1px solid ${p === page ? 'var(--primary)' : 'var(--border)'}`,
                      background: p === page ? 'var(--primary)' : 'var(--card)',
                      color: p === page ? '#fff' : 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                )
              ))}
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--card)', cursor: page === totalPages ? 'not-allowed' : 'pointer',
                opacity: page === totalPages ? 0.4 : 1, color: 'var(--text)',
              }}
            >
              <MdChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Строка показателей: склеенные ячейки «подпись сверху — число снизу».
// items: [{ label, value, tone?: 'warn' | 'ok', title? }]
export default function StatStrip({ items }) {
  return (
    <div className="stat-strip">
      {items.map((it) => (
        <div
          key={it.label}
          className={'stat-cell' + (it.tone ? ` is-${it.tone}` : '')}
          title={it.title}
        >
          <div className="stat-cell-label">{it.label}</div>
          <div className="stat-cell-value">{it.value ?? '—'}</div>
        </div>
      ))}
    </div>
  );
}

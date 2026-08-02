export default function ProgressBar({ value = 0, color, height = 5 }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = color || (pct > 100 ? 'var(--color-danger)' : pct >= 80 ? 'var(--color-warning)' : 'var(--color-success)');
  return (
    <div style={{ height, background: 'var(--color-bg-tertiary)', borderRadius: 99, overflow: 'hidden', minWidth: 60 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width 0.3s' }} />
    </div>
  );
}

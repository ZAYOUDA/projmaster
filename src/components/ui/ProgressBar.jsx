export default function ProgressBar({ value = 0, color, height = 5 }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = color || (pct > 100 ? '#D85A30' : pct >= 80 ? '#BA7517' : '#1D9E75');
  return (
    <div style={{ height, background: '#E8E7E3', borderRadius: 99, overflow: 'hidden', minWidth: 60 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 99, transition: 'width 0.3s' }} />
    </div>
  );
}

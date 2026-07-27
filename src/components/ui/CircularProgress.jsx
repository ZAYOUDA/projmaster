export default function CircularProgress({ value = 0, size = 48, strokeWidth = 5, color }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor = color || (pct > 100 ? '#D85A30' : pct >= 80 ? '#BA7517' : '#1D9E75');
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#E8E7E3" strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={barColor} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.3s' }}
      />
      <text
        x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fontSize={size * 0.26} fontWeight="700" fill="#1A1A18"
      >
        {Math.round(value)}%
      </text>
    </svg>
  );
}

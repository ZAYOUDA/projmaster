export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 24, gap: 16,
    }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: '#1A1A18' }}>{title}</h1>
        {subtitle && <p style={{ margin: '2px 0 0', fontSize: 13, color: '#5F5E5A' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{actions}</div>}
    </div>
  );
}

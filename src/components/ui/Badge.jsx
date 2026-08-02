const VARIANTS = {
  success:    { bg: 'var(--color-success-soft)', color: 'var(--color-success)' },
  warning:    { bg: 'var(--color-warning-soft)', color: 'var(--color-warning)' },
  danger:     { bg: 'var(--color-danger-soft)', color: 'var(--color-danger)' },
  info:       { bg: 'var(--color-info-soft)', color: 'var(--color-info)' },
  neutral:    { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' },
  // statut tâche
  non_demarre: { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' },
  en_cours:    { bg: 'var(--color-info-soft)', color: 'var(--color-info)' },
  termine:     { bg: 'var(--color-success-soft)', color: 'var(--color-success)' },
  bloque:      { bg: 'var(--color-danger-soft)', color: 'var(--color-danger)' },
  // criticité risque
  faible:     { bg: 'var(--color-success-soft)', color: 'var(--color-success)' },
  moyenne:    { bg: 'var(--color-warning-soft)', color: 'var(--color-warning)' },
  elevee:     { bg: 'var(--color-danger-soft)', color: 'var(--color-danger)' },
  critique:   { bg: 'var(--color-critical-soft)', color: 'var(--color-critical)' },
};

export default function Badge({ label, variant = 'neutral' }) {
  const style = VARIANTS[variant] || VARIANTS.neutral;
  return (
    <span
      style={{
        ...style,
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 99,
        fontSize: 12,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

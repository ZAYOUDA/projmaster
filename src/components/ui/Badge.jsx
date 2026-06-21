const VARIANTS = {
  success:    { bg: '#E1F5EE', color: '#1D9E75' },
  warning:    { bg: '#FAEEDA', color: '#BA7517' },
  danger:     { bg: '#FAECE7', color: '#D85A30' },
  info:       { bg: '#E6F1FB', color: '#378ADD' },
  neutral:    { bg: '#F1EFE8', color: '#5F5E5A' },
  // statut tâche
  non_demarre: { bg: '#F1EFE8', color: '#888780' },
  en_cours:    { bg: '#E6F1FB', color: '#378ADD' },
  termine:     { bg: '#E1F5EE', color: '#1D9E75' },
  bloque:      { bg: '#FAECE7', color: '#D85A30' },
  // criticité risque
  faible:     { bg: '#E1F5EE', color: '#1D9E75' },
  moyenne:    { bg: '#FAEEDA', color: '#BA7517' },
  elevee:     { bg: '#FAECE7', color: '#D85A30' },
  critique:   { bg: '#FAE0DA', color: '#C0391B' },
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

import { useState } from 'react';
import { ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../../data/calculations';
import { classifierIndexEVM, CPI_DEFINITION, SPI_DEFINITION, SPI_T_DEFINITION } from '../../utils/evmCalculs';

const STATUT_STYLE = {
  success: { bg: 'var(--color-success-soft)', color: 'var(--color-success)', label: 'Conforme' },
  warning: { bg: 'var(--color-warning-soft)', color: 'var(--color-warning)', label: 'À surveiller' },
  danger:  { bg: 'var(--color-danger-soft)', color: 'var(--color-danger)', label: 'Dérive' },
  neutral: { bg: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)', label: '—' },
};

function KpiPill({ label, value }) {
  const s = STATUT_STYLE[classifierIndexEVM(value)];
  return (
    <span style={{
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 600,
      padding: '3px 9px', borderRadius: 99, whiteSpace: 'nowrap',
    }}>
      {label} {value === null ? '—' : value.toFixed(2).replace('.', ',')}
    </span>
  );
}

function KpiCard({ label, formule, value, definition }) {
  const s = STATUT_STYLE[classifierIndexEVM(value)];
  return (
    <div style={{
      background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 10,
      padding: '14px 16px', flex: 1, minWidth: 220,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{formule}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1 }}>
          {value === null ? '—' : value.toFixed(2).replace('.', ',')}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: s.bg, color: s.color }}>
          {s.label}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{definition}</p>
    </div>
  );
}

function StatChip({ label, value }) {
  return (
    <div style={{ flex: '1 1 120px' }}>
      <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  );
}

// Bandeau CPI/SPI/SPI(t) figé dans le header projet (visible sur tous les onglets) — cliquer
// déplie le détail (définitions, BAC/AC/EV/PV, alertes de cohérence) sans alourdir le header
// en permanence.
export default function SanteProjetEVM({ evm, earnedSchedule, alertes }) {
  const [ouvert, setOuvert] = useState(false);
  if (!evm) return null;

  return (
    <div style={{ marginBottom: 14 }}>
      <button
        onClick={() => setOuvert((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, border: 'none',
          background: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        <KpiPill label="CPI" value={evm.cpi} />
        <KpiPill label="SPI" value={evm.spi} />
        {earnedSchedule && <KpiPill label="SPI(t)" value={earnedSchedule.spiT} />}
        {alertes.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--color-warning)' }}>
            <AlertTriangle size={12} /> {alertes.length}
          </span>
        )}
        {ouvert ? <ChevronUp size={14} color="var(--color-text-tertiary)" /> : <ChevronDown size={14} color="var(--color-text-tertiary)" />}
      </button>

      {ouvert && (
        <div style={{
          marginTop: 12, padding: 16, background: 'var(--color-bg-secondary)',
          border: '0.5px solid var(--color-border-soft)', borderRadius: 12,
        }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <KpiCard label="CPI — coût" formule="EV / AC" value={evm.cpi} definition={CPI_DEFINITION} />
            <KpiCard label="SPI — délai" formule="EV / PV" value={evm.spi} definition={SPI_DEFINITION} />
            {earnedSchedule && (
              <KpiCard label="SPI(t) — Earned Schedule" formule="ES / AT" value={earnedSchedule.spiT} definition={SPI_T_DEFINITION} />
            )}
          </div>

          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', paddingTop: 14, borderTop: '0.5px solid var(--color-border-soft)' }}>
            <StatChip label="BAC · budget prévu" value={formatCurrency(evm.bac)} />
            <StatChip label="AC · coût réel" value={formatCurrency(evm.ac)} />
            <StatChip label="EV · valeur acquise" value={formatCurrency(evm.ev)} />
            <StatChip label="PV · valeur planifiée" value={formatCurrency(evm.pv)} />
          </div>

          {alertes.length > 0 && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '0.5px solid var(--color-border-soft)' }}>
              <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-warning)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={13} /> Avancement probablement pas à jour
              </p>
              {alertes.map((a) => (
                <div key={a.id} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 12,
                  fontSize: 12, color: 'var(--color-text-secondary)', padding: '5px 0',
                  borderBottom: '0.5px solid var(--color-border-soft)',
                }}>
                  <span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>{a.nom}</span>
                  <span style={{ flexShrink: 0 }}>{a.pctAvancement}% déclaré vs {a.pctJours}% des jours consommés</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

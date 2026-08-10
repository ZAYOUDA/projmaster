import { useMemo } from 'react';
import { Navigate, Link } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { useAuth } from '../hooks/useAuth';
import PageHeader from '../components/layout/PageHeader';
import { formatCurrency, calculerBudgetProjet } from '../data/calculations';

// Vue portefeuille en lecture seule (Admin/Manager) : agrège la facturation de tous les
// projets — aucune création/modification ici, ça reste le rôle de l'onglet Facturation
// de chaque projet. Cf. SPEC-V6-ACCES-4-NIVEAUX.md § cross-project billing view.

function montantFacture(f) {
  return f.lignes.reduce((s, l) => s + l.montant, 0);
}
function moisCourt(moisStr) {
  const [year, month] = moisStr.split('-');
  return new Date(+year, +month - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

// KPIs + facturé-par-mois d'un projet, sur le même modèle que l'onglet Facturation du projet.
function statsProjet(projet) {
  const factures = projet.factures || [];
  const nonBrouillon = factures.filter((f) => f.statut !== 'brouillon');
  const totalFacture = nonBrouillon.reduce((s, f) => s + montantFacture(f), 0);
  const totalEncaisse = factures.filter((f) => f.statut === 'payee').reduce((s, f) => s + montantFacture(f), 0);
  const enAttente = factures.filter((f) => f.statut === 'emise').reduce((s, f) => s + montantFacture(f), 0);
  const budgetConso = calculerBudgetProjet(projet).conso;
  const resteAFacturer = Math.max(0, budgetConso - totalFacture);

  const parMois = {};
  nonBrouillon.forEach((f) => { parMois[f.mois] = (parMois[f.mois] || 0) + montantFacture(f); });

  return { totalFacture, totalEncaisse, enAttente, resteAFacturer, parMois };
}

export default function PortfolioFacturation() {
  const { hasFullAccess } = useAuth();
  const projets = useAppStore((s) => s.projets);

  const { rows, moisList, totaux, totauxParMois } = useMemo(() => {
    const rows = projets
      .map((p) => ({ projet: p, stats: statsProjet(p) }))
      .filter((r) => (r.projet.factures || []).length > 0)
      .sort((a, b) => b.stats.totalFacture - a.stats.totalFacture);

    const moisSet = new Set();
    rows.forEach((r) => Object.keys(r.stats.parMois).forEach((m) => moisSet.add(m)));
    const moisList = [...moisSet].sort();

    const totaux = rows.reduce((acc, r) => ({
      totalFacture: acc.totalFacture + r.stats.totalFacture,
      totalEncaisse: acc.totalEncaisse + r.stats.totalEncaisse,
      enAttente: acc.enAttente + r.stats.enAttente,
      resteAFacturer: acc.resteAFacturer + r.stats.resteAFacturer,
    }), { totalFacture: 0, totalEncaisse: 0, enAttente: 0, resteAFacturer: 0 });

    const totauxParMois = {};
    moisList.forEach((m) => {
      totauxParMois[m] = rows.reduce((s, r) => s + (r.stats.parMois[m] || 0), 0);
    });

    return { rows, moisList, totaux, totauxParMois };
  }, [projets]);

  if (!hasFullAccess) return <Navigate to="/" replace />;

  return (
    <div style={{ padding: 32 }}>
      <PageHeader title="Facturation — vue portefeuille" subtitle="Tous projets confondus" />

      {/* KPIs portefeuille */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total facturé HT', value: formatCurrency(totaux.totalFacture), color: 'var(--color-text-primary)' },
          { label: 'Encaissé', value: formatCurrency(totaux.totalEncaisse), color: 'var(--color-success)' },
          { label: 'En attente', value: formatCurrency(totaux.enAttente), color: 'var(--color-warning)' },
          { label: 'Reste à facturer', value: formatCurrency(totaux.resteAFacturer), color: 'var(--color-info)' },
        ].map((k) => (
          <div key={k.label} style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{k.label}</p>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tableau projet × mois */}
      {rows.length === 0 ? (
        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 10, padding: 40, textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
          Aucune facture émise ou payée sur aucun projet pour le moment.
        </div>
      ) : (
        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 10, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 600, fontSize: 13, width: '100%' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '0.5px solid var(--color-border-soft)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>Projet</th>
                {moisList.map((m) => (
                  <th key={m} style={{ padding: '10px 12px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>
                    {moisCourt(m)}
                  </th>
                ))}
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', borderLeft: '2px solid var(--color-border)' }}>
                  Total facturé
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ projet, stats }) => (
                <tr key={projet.id} style={{ borderBottom: '0.5px solid var(--color-border-soft)' }}>
                  <td style={{ padding: '9px 14px', whiteSpace: 'nowrap' }}>
                    <Link to={`/projet/${projet.id}/facturation`} style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: projet.couleur, flexShrink: 0 }} />
                      {projet.nom}
                    </Link>
                  </td>
                  {moisList.map((m) => {
                    const v = stats.parMois[m] || 0;
                    return (
                      <td key={m} style={{ padding: '9px 12px', textAlign: 'right', color: v > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                        {v > 0 ? formatCurrency(v) : '—'}
                      </td>
                    );
                  })}
                  <td style={{ padding: '9px 14px', textAlign: 'right', fontWeight: 600, borderLeft: '2px solid var(--color-border)' }}>
                    {formatCurrency(stats.totalFacture)}
                  </td>
                </tr>
              ))}
              <tr style={{ background: 'var(--color-bg-secondary)', borderTop: '2px solid var(--color-border)', fontWeight: 700 }}>
                <td style={{ padding: '10px 14px' }}>TOTAL</td>
                {moisList.map((m) => (
                  <td key={m} style={{ padding: '10px 12px', textAlign: 'right' }}>
                    {totauxParMois[m] > 0 ? formatCurrency(totauxParMois[m]) : '—'}
                  </td>
                ))}
                <td style={{ padding: '10px 14px', textAlign: 'right', borderLeft: '2px solid var(--color-border)' }}>
                  {formatCurrency(totaux.totalFacture)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { calculerBudgetProjet, calculerAvancementProjet, formatCurrency } from '../data/calculations';
import ProgressBar from '../components/ui/ProgressBar';
import Badge from '../components/ui/Badge';
import PageHeader from '../components/layout/PageHeader';

// ── Helpers ───────────────────────────────────────────────────────
const FREQ_JOURS = {
  quotidien: 1, hebdomadaire: 7, bimensuel: 14, mensuel: 30, trimestriel: 90,
};

function prochainContact(sh) {
  if (!sh.derniere_interaction) return true;
  const delai = FREQ_JOURS[sh.checkin_frequency] || 30;
  const limite = new Date(sh.derniere_interaction);
  limite.setDate(limite.getDate() + delai);
  return limite <= new Date();
}

function montantFacture(f) {
  return f.lignes.reduce((s, l) => s + l.montant, 0);
}

function isEnRetard(f) {
  return f.statut === 'emise' && f.date_echeance && new Date(f.date_echeance) < new Date();
}

function statutBadge(projet) {
  const b = calculerBudgetProjet(projet);
  if (projet.statut === 'cloture') return { label: 'Clôturé', variant: 'info' };
  if (projet.statut === 'en_pause') return { label: 'En pause', variant: 'neutral' };
  if (b.prev > 0 && b.conso > b.prev) return { label: 'Dépassement', variant: 'danger' };
  if (b.prev > 0 && b.conso / b.prev > 0.8) return { label: 'Risque', variant: 'warning' };
  return { label: 'On track', variant: 'success' };
}

// ── Dashboard ─────────────────────────────────────────────────────
export default function Dashboard() {
  const projets = useAppStore((s) => s.projets);
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const updateStakeholder = useAppStore((s) => s.updateStakeholder);
  const navigate = useNavigate();

  // KPIs globaux
  const totalPrev = projets.reduce((s, p) => s + calculerBudgetProjet(p).prev, 0);
  const totalConso = projets.reduce((s, p) => s + calculerBudgetProjet(p).conso, 0);
  const totalJours = projets.reduce((s, p) =>
    s + p.wbs.reduce((sn, n) => sn + n.affectations.reduce((sa, a) => sa + a.jours_prev, 0), 0), 0);
  const risquesOuverts = projets.reduce((s, p) => s + p.risques.filter((r) => r.statut === 'ouvert').length, 0);
  const risquesCritiques = projets.reduce((s, p) => s + p.risques.filter((r) => r.criticite === 'critique' && r.statut === 'ouvert').length, 0);

  // Milestones à venir (10 prochains) — include livrables WBS épinglés
  const today = new Date();
  const milestones = [
    ...projets.flatMap((p) => (p.milestones || []).map((m) => ({
      ...m, projetNom: p.nom, projetCouleur: p.couleur, projetId: p.id, isLivrable: false,
    }))),
    ...projets.flatMap((p) => (p.wbs || [])
      .filter((n) => n.epingle_dashboard && n.date_fin_prev && n.statut !== 'termine')
      .map((n) => ({
        id: n.id, nom: n.nom, date_prevue: n.date_fin_prev, statut: n.statut,
        projetNom: p.nom, projetCouleur: p.couleur, projetId: p.id, isLivrable: true,
      }))
    ),
  ]
    .filter((m) => m.statut !== 'atteint')
    .sort((a, b) => new Date(a.date_prevue) - new Date(b.date_prevue))
    .slice(0, 10);

  // Charge collaborateurs
  const chargeCollab = collaborateurs.filter((c) => c.actif).map((c) => {
    const joursPrev = projets.reduce((s, p) =>
      s + p.wbs.reduce((sn, n) => sn + n.affectations.filter((a) => a.collaborateur_id === c.id).reduce((sa, a) => sa + a.jours_prev, 0), 0), 0);
    const joursReels = projets.reduce((s, p) =>
      s + p.wbs.reduce((sn, n) => sn + n.affectations.filter((a) => a.collaborateur_id === c.id).reduce((sa, a) => sa + a.jours_realises, 0), 0), 0);
    const nbProjets = projets.filter((p) => p.wbs.some((n) => n.affectations.some((a) => a.collaborateur_id === c.id))).length;
    return { ...c, joursPrev, joursReels, nbProjets };
  });

  // V2 — Stakeholders à contacter
  const stakeholdersAContacter = projets.flatMap((p) =>
    (p.stakeholders || [])
      .filter((sh) => (!sh.statut || sh.statut === 'actif') && prochainContact(sh))
      .map((sh) => ({ ...sh, projetNom: p.nom, projetCouleur: p.couleur, projetId: p.id }))
  );

  // V2 — Facturation globale
  const toutesFactures = projets.flatMap((p) =>
    (p.factures || []).map((f) => ({ ...f, projetNom: p.nom, projetCouleur: p.couleur, projetId: p.id }))
  );
  const factTotalFacture = toutesFactures.filter((f) => f.statut === 'emise' || f.statut === 'payee').reduce((s, f) => s + montantFacture(f), 0);
  const factEncaisse = toutesFactures.filter((f) => f.statut === 'payee').reduce((s, f) => s + montantFacture(f), 0);
  const factEnAttente = toutesFactures.filter((f) => f.statut === 'emise').reduce((s, f) => s + montantFacture(f), 0);
  const factEnRetard = toutesFactures.filter(isEnRetard);

  const handleMarquerContacte = (sh) => {
    updateStakeholder(sh.projetId, sh.id, { derniere_interaction: new Date().toISOString().slice(0, 10) });
  };

  return (
    <div style={{ padding: 32 }}>
      <PageHeader title="Vue d'ensemble" subtitle={`${projets.filter(p => p.statut === 'actif').length} projets actifs`} />

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        {[
          { label: 'Budget prévisionnel', value: formatCurrency(totalPrev), sub: 'tous projets' },
          { label: 'Budget consommé', value: formatCurrency(totalConso), sub: totalPrev > 0 ? `${Math.round(totalConso / totalPrev * 100)}% consommé` : '—' },
          { label: 'Charge planifiée', value: `${totalJours} j`, sub: 'jours prévisionnels' },
          {
            label: 'Risques ouverts', value: risquesOuverts,
            sub: risquesCritiques > 0 ? <span style={{ color: '#D85A30' }}>{risquesCritiques} critiques</span> : 'Aucun critique',
          },
        ].map((kpi) => (
          <div key={kpi.label} style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 20 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#888780', fontWeight: 500 }}>{kpi.label}</p>
            <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 600, color: '#1A1A18' }}>{kpi.value}</p>
            <p style={{ margin: 0, fontSize: 12, color: '#5F5E5A' }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        {/* Colonne gauche */}
        <div>
          {/* Tableau projets */}
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Projets</h3>
          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                  {['Projet', 'Avancement', 'Budget', 'Statut'].map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#888780' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projets.map((p) => {
                  const av = calculerAvancementProjet(p);
                  const b = calculerBudgetProjet(p);
                  const badge = statutBadge(p);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/projet/${p.id}/wbs`)}
                      style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#FAFAF9'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{p.nom}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', width: 160 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <ProgressBar value={av} color={p.couleur} />
                          <span style={{ fontSize: 12, color: '#5F5E5A', flexShrink: 0 }}>{av}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: '#5F5E5A' }}>
                        {b.prev > 0 ? <>{formatCurrency(b.conso)} / {formatCurrency(b.prev)}</> : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge label={badge.label} variant={badge.variant} />
                      </td>
                    </tr>
                  );
                })}
                {projets.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#888780' }}>Aucun projet. Créez-en un depuis la sidebar.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Charge collaborateurs */}
          <h3 style={{ margin: '24px 0 12px', fontSize: 14, fontWeight: 600 }}>Charge des collaborateurs</h3>
          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                  {['Collaborateur', 'J. planifiés', 'J. réalisés', 'Projets'].map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: '#888780' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chargeCollab.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: '50%', background: c.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, color: '#fff' }}>{c.initiales}</div>
                        <span style={{ fontSize: 13 }}>{c.prenom} {c.nom}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: c.joursPrev > 20 ? '#D85A30' : '#1A1A18' }}>{c.joursPrev} j</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: '#5F5E5A' }}>{c.joursReels} j</td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: '#5F5E5A' }}>{c.nbProjets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* V2 — Widget Facturation */}
          {toutesFactures.length > 0 && (
            <>
              <h3 style={{ margin: '24px 0 12px', fontSize: 14, fontWeight: 600 }}>Facturation — Vue globale</h3>
              <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
                {/* KPIs facturation */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {[
                    { label: 'Total facturé', value: formatCurrency(factTotalFacture), color: '#1A1A18' },
                    { label: 'Encaissé', value: formatCurrency(factEncaisse), color: '#1D9E75' },
                    { label: 'En attente', value: formatCurrency(factEnAttente), color: '#BA7517' },
                    { label: 'En retard', value: formatCurrency(factEnRetard.reduce((s, f) => s + montantFacture(f), 0)), color: factEnRetard.length > 0 ? '#D85A30' : '#888780' },
                  ].map((kpi, i) => (
                    <div key={kpi.label} style={{ padding: '14px 16px', borderRight: i < 3 ? '0.5px solid rgba(0,0,0,0.08)' : 'none' }}>
                      <p style={{ margin: '0 0 4px', fontSize: 11, color: '#888780', fontWeight: 500 }}>{kpi.label}</p>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: kpi.color }}>{kpi.value}</p>
                    </div>
                  ))}
                </div>
                {/* Factures en retard */}
                {factEnRetard.length > 0 && (
                  <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.08)', padding: '10px 16px' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#D85A30' }}>Factures en retard de paiement</p>
                    {factEnRetard.map((f) => (
                      <div
                        key={f.id}
                        onClick={() => navigate(`/projet/${f.projetId}/facturation`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 12 }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.projetCouleur, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', color: '#D85A30', fontWeight: 500 }}>{f.numero}</span>
                        <span style={{ color: '#5F5E5A' }}>—</span>
                        <span style={{ color: '#5F5E5A' }}>{f.projetNom}</span>
                        <span style={{ color: '#5F5E5A' }}>—</span>
                        <span style={{ fontWeight: 600, color: '#D85A30' }}>{formatCurrency(montantFacture(f))}</span>
                        <span style={{ color: '#D85A30', marginLeft: 'auto' }}>éch. {new Date(f.date_echeance).toLocaleDateString('fr-FR')} ⚠</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Colonne droite */}
        <div>
          {/* Milestones */}
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Prochains jalons</h3>
          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
            {milestones.length === 0 && (
              <p style={{ padding: 24, textAlign: 'center', color: '#888780', margin: 0 }}>Aucun jalon à venir</p>
            )}
            {milestones.map((m, i) => {
              const late = new Date(m.date_prevue) < today && m.statut !== 'atteint';
              return (
                <div key={m.id} style={{
                  padding: '12px 16px',
                  borderBottom: i < milestones.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.projetCouleur, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: late ? '#D85A30' : '#1A1A18', flex: 1 }}>{m.nom}</span>
                    {m.isLivrable && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: '#EFF6FF', color: '#378ADD', flexShrink: 0 }}>
                        Livrable
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14 }}>
                    <span style={{ fontSize: 12, color: '#888780' }}>{m.projetNom}</span>
                    <span style={{ fontSize: 12, color: late ? '#D85A30' : '#5F5E5A', fontWeight: late ? 500 : 400 }}>
                      {new Date(m.date_prevue).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* V2 — Stakeholders à contacter */}
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Parties prenantes à contacter</h3>
          <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
            {stakeholdersAContacter.length === 0 && (
              <p style={{ padding: 20, textAlign: 'center', color: '#888780', margin: 0, fontSize: 12 }}>Aucun contact en attente</p>
            )}
            {stakeholdersAContacter.slice(0, 8).map((sh, i) => (
              <div key={sh.id} style={{
                padding: '10px 16px',
                borderBottom: i < Math.min(stakeholdersAContacter.length, 8) - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: sh.projetCouleur, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#1A1A18' }}>
                      {sh.role}{sh.nom ? ` · ${sh.nom}` : ''}
                    </p>
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: '#888780' }}>
                      {sh.projetNom} — {sh.checkin_frequency}
                      {sh.derniere_interaction && (
                        <> · Dernier : {new Date(sh.derniere_interaction).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</>
                      )}
                      {!sh.derniere_interaction && ' · Jamais contacté'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleMarquerContacte(sh)}
                    style={{
                      flexShrink: 0, fontSize: 11, padding: '3px 8px', borderRadius: 5,
                      border: '1px solid rgba(0,0,0,0.15)', background: '#fff', cursor: 'pointer', color: '#5F5E5A',
                      whiteSpace: 'nowrap',
                    }}
                    title="Marquer comme contacté aujourd'hui"
                  >
                    ✓ Contacté
                  </button>
                </div>
              </div>
            ))}
            {stakeholdersAContacter.length > 8 && (
              <div style={{ padding: '8px 16px', borderTop: '0.5px solid rgba(0,0,0,0.06)', fontSize: 12, color: '#888780', textAlign: 'center' }}>
                +{stakeholdersAContacter.length - 8} autres à contacter
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

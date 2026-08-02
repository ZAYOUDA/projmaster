import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ChevronRight, Wallet, CalendarClock, AlertTriangle as AlertTriangleIcon } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { calculerBudgetProjet, calculerAvancementProjet, formatCurrency } from '../data/calculations';
import { moisAnnee, calculerSuiviProjetRun, calculerBurnRateEtProjection } from '../utils/runCalculs';
import { PROBABILITE_LEVELS, IMPACT_LEVELS } from '../utils/riadCalculs';
import { useAuth } from '../hooks/useAuth';
import MesActions from '../components/dashboard/MesActions';

const PROBA_VALEUR = Object.fromEntries(PROBABILITE_LEVELS.map((p) => [p.key, p.valeur]));
const IMPACT_VALEUR = Object.fromEntries(IMPACT_LEVELS.map((i) => [i.key, i.valeur]));
import ProgressBar from '../components/ui/ProgressBar';
import CircularProgress from '../components/ui/CircularProgress';
import Badge from '../components/ui/Badge';

const fmtJours = (n) => (n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

// Suivi RUN de l'année en cours, pour la jauge dashboard et le badge de statut.
function suiviRunAnneeCourante(projet) {
  const annee = new Date().getFullYear();
  const months = moisAnnee(annee);
  const commandes = (projet.commandes || []).filter((c) => c.annee === annee);
  const suivi = calculerSuiviProjetRun(commandes, projet.consoMensuelle || {}, months);
  const { projection } = calculerBurnRateEtProjection(commandes, projet.consoMensuelle || {}, months, new Date().getMonth() + 1);
  return { ...suivi, projection };
}

// Total commandé/consommé RUN d'un collaborateur, toutes commandes et années confondues.
function chargeRunCollab(projets, collabId) {
  let commande = 0, conso = 0;
  for (const p of projets) {
    if (p.type !== 'RUN') continue;
    for (const cmd of (p.commandes || [])) {
      for (const l of (cmd.lignes || [])) {
        if (l.collabId !== collabId) continue;
        commande += l.nbjCommande || 0;
        conso += Object.values(p.consoMensuelle || {}).reduce((s, byLigne) => s + (byLigne[l.id] || 0), 0);
      }
    }
  }
  return { commande, conso };
}

// ── Helpers ───────────────────────────────────────────────────────
const FREQ_JOURS = {
  quotidien: 1, hebdomadaire: 7, bimensuel: 14, mensuel: 30, trimestriel: 90,
};

// toISOString() convertit en UTC : pour un Date à minuit local (fuseau UTC+, ex. France), ça
// retombe sur la veille. On formate donc à partir des composants locaux du Date.
function localIso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

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
  if (projet.statut === 'cloture') return { label: 'Clôturé', variant: 'info' };
  if (projet.statut === 'en_pause') return { label: 'En pause', variant: 'neutral' };

  if (projet.type === 'RUN') {
    const { reste, projection } = suiviRunAnneeCourante(projet);
    if (reste < 0) return { label: 'Dépassement', variant: 'danger' };
    if (projection && !projection.depasseAnnee) return { label: 'Risque', variant: 'warning' };
    return { label: 'On track', variant: 'success' };
  }

  const b = calculerBudgetProjet(projet);
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
  const { userDoc } = useAuth();
  const isAdmin = userDoc?.role === 'admin';
  const [chargeOuverte, setChargeOuverte] = useState(true);

  // KPIs globaux
  const totalPrev = projets.reduce((s, p) => s + calculerBudgetProjet(p).prev, 0);
  const totalConso = projets.reduce((s, p) => s + calculerBudgetProjet(p).conso, 0);
  const totalJours = projets.reduce((s, p) =>
    s + p.wbs.reduce((sn, n) => sn + n.affectations.reduce((sa, a) => sa + a.jours_prev, 0), 0), 0);
  const risquesOuverts = projets.reduce((s, p) => s + (p.riad?.risques || []).filter((r) => r.status !== 'cloture').length, 0);
  const risquesCritiques = projets.reduce((s, p) => s + (p.riad?.risques || []).filter((r) =>
    r.status !== 'cloture' && (PROBA_VALEUR[r.probabilite] || 0) * (IMPACT_VALEUR[r.impact] || 0) > 16
  ).length, 0);

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

  // Charge collaborateurs (BUILD : jours WBS ; RUN : jours des lignes de commande, au mois)
  const chargeCollab = collaborateurs.filter((c) => c.actif).map((c) => {
    const joursPrevBuild = projets.reduce((s, p) =>
      s + p.wbs.reduce((sn, n) => sn + n.affectations.filter((a) => a.collaborateur_id === c.id).reduce((sa, a) => sa + a.jours_prev, 0), 0), 0);
    const joursReelsBuild = projets.reduce((s, p) =>
      s + p.wbs.reduce((sn, n) => sn + n.affectations.filter((a) => a.collaborateur_id === c.id).reduce((sa, a) => sa + a.jours_realises, 0), 0), 0);
    const nbProjetsBuild = projets.filter((p) => p.wbs.some((n) => n.affectations.some((a) => a.collaborateur_id === c.id))).length;
    const { commande: joursPrevRun, conso: joursReelsRun } = chargeRunCollab(projets, c.id);
    const nbProjetsRun = projets.filter((p) => p.type === 'RUN' && (p.commandes || []).some((cmd) => (cmd.lignes || []).some((l) => l.collabId === c.id))).length;
    return {
      ...c,
      joursPrev: joursPrevBuild + joursPrevRun,
      joursReels: joursReelsBuild + joursReelsRun,
      nbProjets: nbProjetsBuild + nbProjetsRun,
    };
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
    updateStakeholder(sh.projetId, sh.id, { derniere_interaction: localIso(new Date()) });
  };

  const pctConso = totalPrev > 0 ? Math.round(totalConso / totalPrev * 100) : 0;
  const prenom = userDoc?.prenom || '';

  return (
    <div style={{ padding: 32 }}>
      {/* En-tête personnalisé */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Bonjour{prenom ? ` ${prenom}` : ''},
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {projets.filter((p) => p.statut === 'actif').length} projets actifs — voici où vous en êtes aujourd'hui.
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 32 }}>
        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: 20, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Budget prévisionnel</p>
            <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatCurrency(totalPrev)}</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>tous projets</p>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--color-info-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={18} color="var(--color-info)" />
          </div>
        </div>

        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Budget consommé</p>
            <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatCurrency(totalConso)}</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>{totalPrev > 0 ? `${pctConso}% consommé` : '—'}</p>
          </div>
          {totalPrev > 0 && <CircularProgress value={pctConso} size={44} strokeWidth={4} />}
        </div>

        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: 20, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Charge planifiée</p>
            <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 600, color: 'var(--color-text-primary)' }}>{fmtJours(totalJours)} j</p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-secondary)' }}>jours prévisionnels</p>
          </div>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--color-bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CalendarClock size={18} color="#7F77DD" />
          </div>
        </div>

        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: 20, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Risques ouverts</p>
            <p style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 600, color: 'var(--color-text-primary)' }}>{risquesOuverts}</p>
            <p style={{ margin: 0, fontSize: 12, color: risquesCritiques > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
              {risquesCritiques > 0 ? `${risquesCritiques} critiques` : 'Aucun critique'}
            </p>
          </div>
          <div style={{
            width: 40, height: 40, borderRadius: 12, flexShrink: 0,
            background: risquesCritiques > 0 ? 'var(--color-danger-soft)' : risquesOuverts > 0 ? 'var(--color-warning-soft)' : 'var(--color-bg-tertiary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangleIcon size={18} color={risquesCritiques > 0 ? 'var(--color-danger)' : risquesOuverts > 0 ? 'var(--color-warning)' : 'var(--color-text-tertiary)'} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>
        {/* Colonne gauche */}
        <div>
          {/* Tableau projets */}
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Projets</h3>
          <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '0.5px solid var(--color-border-soft)' }}>
                  {['Projet', 'Avancement', 'Budget', 'Statut'].map((h) => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projets.map((p) => {
                  const isRun = p.type === 'RUN';
                  const av = calculerAvancementProjet(p);
                  const b = calculerBudgetProjet(p);
                  const suiviRun = isRun ? suiviRunAnneeCourante(p) : null;
                  const badge = statutBadge(p);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/projet/${p.id}/${isRun ? 'suivi-mensuel' : 'wbs'}`)}
                      style={{ borderBottom: '0.5px solid var(--color-border-soft)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{p.nom}</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', width: 160 }}>
                        {isRun ? (
                          <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ProgressBar value={av} color={p.couleur} />
                            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{av}%</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>
                        {isRun
                          ? (suiviRun.cmdNbj > 0 ? <>{fmtJours(suiviRun.consoNbj)} / {fmtJours(suiviRun.cmdNbj)} j</> : '—')
                          : (b.prev > 0 ? <>{formatCurrency(b.conso)} / {formatCurrency(b.prev)}</> : '—')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <Badge label={badge.label} variant={badge.variant} />
                          <ChevronRight size={15} color="var(--color-text-tertiary)" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {projets.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Aucun projet. Créez-en un depuis la sidebar.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Charge collaborateurs */}
          <button
            onClick={() => setChargeOuverte((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, width: '100%',
              margin: '24px 0 12px', padding: 0, border: 'none', background: 'none', cursor: 'pointer',
            }}
          >
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Charge des collaborateurs</h3>
            {chargeOuverte ? <ChevronUp size={15} color="var(--color-text-tertiary)" /> : <ChevronDown size={15} color="var(--color-text-tertiary)" />}
          </button>
          {chargeOuverte && (
            <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '0.5px solid var(--color-border-soft)' }}>
                    {['Collaborateur', 'J. planifiés', 'J. réalisés', 'Projets'].map((h) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {chargeCollab.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '0.5px solid var(--color-border-soft)' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 24, height: 24, borderRadius: '50%', background: c.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 500, color: '#fff' }}>{c.initiales}</div>
                          <span style={{ fontSize: 13 }}>{c.prenom} {c.nom}</span>
                        </div>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: c.joursPrev > 20 ? 'var(--color-danger)' : 'var(--color-text-primary)', minWidth: 140 }}>
                        <div style={{ marginBottom: 4 }}>{fmtJours(c.joursPrev)} j</div>
                        {c.joursPrev > 0 && <ProgressBar value={Math.round(c.joursReels / c.joursPrev * 100)} color={c.couleur} height={4} />}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{fmtJours(c.joursReels)} j</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--color-text-secondary)' }}>{c.nbProjets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* V2 — Widget Facturation */}
          {toutesFactures.length > 0 && (
            <>
              <h3 style={{ margin: '24px 0 12px', fontSize: 14, fontWeight: 600 }}>Facturation — Vue globale</h3>
              <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
                {/* KPIs facturation */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {[
                    { label: 'Total facturé', value: formatCurrency(factTotalFacture), color: 'var(--color-text-primary)' },
                    { label: 'Encaissé', value: formatCurrency(factEncaisse), color: 'var(--color-success)' },
                    { label: 'En attente', value: formatCurrency(factEnAttente), color: 'var(--color-warning)' },
                    { label: 'En retard', value: formatCurrency(factEnRetard.reduce((s, f) => s + montantFacture(f), 0)), color: factEnRetard.length > 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)' },
                  ].map((kpi, i) => (
                    <div key={kpi.label} style={{ padding: '14px 16px', borderRight: i < 3 ? '0.5px solid var(--color-border-soft)' : 'none' }}>
                      <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{kpi.label}</p>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: kpi.color }}>{kpi.value}</p>
                    </div>
                  ))}
                </div>
                {/* Factures en retard */}
                {factEnRetard.length > 0 && (
                  <div style={{ borderTop: '0.5px solid var(--color-border-soft)', padding: '10px 16px' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-danger)' }}>Factures en retard de paiement</p>
                    {factEnRetard.map((f) => (
                      <div
                        key={f.id}
                        onClick={() => navigate(`/projet/${f.projetId}/facturation`)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 12 }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.projetCouleur, flexShrink: 0 }} />
                        <span style={{ fontFamily: 'monospace', color: 'var(--color-danger)', fontWeight: 500 }}>{f.numero}</span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{f.projetNom}</span>
                        <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                        <span style={{ fontWeight: 600, color: 'var(--color-danger)' }}>{formatCurrency(montantFacture(f))}</span>
                        <span style={{ color: 'var(--color-danger)', marginLeft: 'auto' }}>éch. {new Date(f.date_echeance).toLocaleDateString('fr-FR')} ⚠</span>
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
          {/* Mes actions — to-do personnelle du PM, indépendante des projets */}
          {isAdmin && <MesActions />}

          {/* Milestones */}
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Prochains jalons</h3>
          <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
            {milestones.length === 0 && (
              <p style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)', margin: 0 }}>Aucun jalon à venir</p>
            )}
            {milestones.map((m, i) => {
              const late = new Date(m.date_prevue) < today && m.statut !== 'atteint';
              return (
                <div key={m.id} style={{
                  padding: '12px 16px',
                  borderBottom: i < milestones.length - 1 ? '0.5px solid var(--color-border-soft)' : 'none',
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.projetCouleur, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: late ? 'var(--color-danger)' : 'var(--color-text-primary)', flex: 1 }}>{m.nom}</span>
                    {m.isLivrable && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 99, background: 'var(--color-info-soft)', color: 'var(--color-info)', flexShrink: 0 }}>
                        Livrable
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingLeft: 14 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>{m.projetNom}</span>
                    <span style={{ fontSize: 12, color: late ? 'var(--color-danger)' : 'var(--color-text-secondary)', fontWeight: late ? 500 : 400 }}>
                      {new Date(m.date_prevue).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* V2 — Stakeholders à contacter */}
          <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>Parties prenantes à contacter</h3>
          <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
            {stakeholdersAContacter.length === 0 && (
              <p style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-tertiary)', margin: 0, fontSize: 12 }}>Aucun contact en attente</p>
            )}
            {stakeholdersAContacter.slice(0, 8).map((sh, i) => (
              <div key={sh.id} style={{
                padding: '10px 16px',
                borderBottom: i < Math.min(stakeholdersAContacter.length, 8) - 1 ? '0.5px solid var(--color-border-soft)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: sh.projetCouleur, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>
                      {sh.role}{sh.nom ? ` · ${sh.nom}` : ''}
                    </p>
                    <p style={{ margin: '1px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
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
                      border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', cursor: 'pointer', color: 'var(--color-text-secondary)',
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
              <div style={{ padding: '8px 16px', borderTop: '0.5px solid var(--color-border-soft)', fontSize: 12, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
                +{stakeholdersAContacter.length - 8} autres à contacter
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router-dom';
import { ChevronRight, Wallet, CalendarClock, AlertTriangle as AlertTriangleIcon } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { calculerBudgetProjet, calculerAvancementProjet, calculerBudgetParTypeCollab, estCollaborateurExterne, formatCurrency } from '../data/calculations';
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
  const { userDoc, hasFullAccess, isChefProjet, isCollabSur, isChefProjetSur } = useAuth();
  // Mes actions (todo perso) : Admin/Manager/Chef de Projet, jamais Collaborateur.
  const canUseTaches = hasFullAccess || isChefProjet;

  // Vue d'ensemble (KPI, tableau Projets, jalons, facturation, parties prenantes) : uniquement
  // les projets sur lesquels la personne a un rôle de GESTION — admin/manager (tous, sans
  // filtre) ou chef de projet SUR CE projet précis (rôle par projet, cf. isChefProjetSur). Un
  // profil collaborateur-sur-un-projet-et-chef-de-projet-sur-un-autre ne doit voir dans cette
  // vue que le(s) projet(s) où il est chef de projet — pas ceux où il n'est que collaborateur
  // (mêmes données que Budget/Facturation/RIAD, déjà masquées côté onglets projet pour un
  // simple collaborateur, cf. ROLES_GESTION dans ProjetLayout.jsx).
  const projetsGestion = hasFullAccess ? projets : projets.filter((p) => isChefProjetSur(p.id));

  // KPIs globaux
  const totalPrev = projetsGestion.reduce((s, p) => s + calculerBudgetProjet(p).prev, 0);
  const totalConso = projetsGestion.reduce((s, p) => s + calculerBudgetProjet(p).conso, 0);
  const totalJours = projetsGestion.reduce((s, p) =>
    s + p.wbs.reduce((sn, n) => sn + n.affectations.reduce((sa, a) => sa + a.jours_prev, 0), 0), 0);
  // Part portée par des collaborateurs externes (préfixe "EXT-", cf. estCollaborateurExterne) —
  // tous projets confondus, sur les 3 mêmes totaux (budget prév., budget consommé, charge
  // planifiée). N'est qu'une lecture de la répartition : ne change aucun des totaux ci-dessus.
  const totalPrevExterne = projetsGestion.reduce((s, p) => s + calculerBudgetParTypeCollab(p, collaborateurs).prevExterne, 0);
  const totalConsoExterne = projetsGestion.reduce((s, p) => s + calculerBudgetParTypeCollab(p, collaborateurs).consoExterne, 0);
  const totalJoursExterne = projetsGestion.reduce((s, p) =>
    s + p.wbs.reduce((sn, n) => sn + n.affectations.reduce((sa, a) =>
      sa + (estCollaborateurExterne(collaborateurs.find((c) => c.id === a.collaborateur_id)) ? (a.jours_prev || 0) : 0), 0), 0), 0);
  const pctPrevExterne = totalPrev > 0 ? Math.round(totalPrevExterne / totalPrev * 100) : 0;
  const pctConsoExterne = totalConso > 0 ? Math.round(totalConsoExterne / totalConso * 100) : 0;
  const pctJoursExterne = totalJours > 0 ? Math.round(totalJoursExterne / totalJours * 100) : 0;
  const risquesOuverts = projetsGestion.reduce((s, p) => s + (p.riad?.risques || []).filter((r) => r.status !== 'cloture').length, 0);
  const risquesCritiques = projetsGestion.reduce((s, p) => s + (p.riad?.risques || []).filter((r) =>
    r.status !== 'cloture' && (PROBA_VALEUR[r.probabilite] || 0) * (IMPACT_VALEUR[r.impact] || 0) > 16
  ).length, 0);

  // Milestones à venir (10 prochains) — include livrables WBS épinglés
  const today = new Date();
  const milestones = [
    ...projetsGestion.flatMap((p) => (p.milestones || []).map((m) => ({
      ...m, projetNom: p.nom, projetCouleur: p.couleur, projetId: p.id, isLivrable: false,
    }))),
    ...projetsGestion.flatMap((p) => (p.wbs || [])
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

  // V2 — Stakeholders à contacter
  const stakeholdersAContacter = projetsGestion.flatMap((p) =>
    (p.stakeholders || [])
      .filter((sh) => (!sh.statut || sh.statut === 'actif') && prochainContact(sh))
      .map((sh) => ({ ...sh, projetNom: p.nom, projetCouleur: p.couleur, projetId: p.id }))
  );

  // V2 — Facturation globale
  const toutesFactures = projetsGestion.flatMap((p) =>
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
    // Hauteur calée sur celle du <main> parent (lui-même 100vh via le flex row de App.jsx) +
    // colonne flex avec overflow:hidden : tout le contenu doit tenir dans un seul écran sans
    // scroll de page (retour utilisateur : "ça tient pas sur une seule page je dois tjr
    // descendre"). Chaque bloc de contenu variable (tableaux, listes) a son propre scroll
    // interne borné (flex:1 + minHeight:0 + overflowY:auto) plutôt que de repousser la page.
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 20, overflow: 'hidden' }}>
      {/* En-tête personnalisé */}
      <div style={{ marginBottom: 14, flexShrink: 0 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Bonjour{prenom ? ` ${prenom}` : ''},
        </h1>
        <p style={{ margin: '2px 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {projetsGestion.filter((p) => p.statut === 'actif').length} projets actifs — voici où vous en êtes aujourd'hui.
        </p>
      </div>

      {/* Grille unique 1fr/340px pour TOUT le contenu (KPI et Mes actions inclus) : les deux
          colonnes s'écoulent chacune indépendamment (leur propre scroll interne), au lieu de
          mettre KPI et Mes actions dans une rangée de grille séparée dont la hauteur suit
          automatiquement le plus grand des deux — c'est ce qui créait un vide sous les KPI
          (et repoussait "Projets") à chaque tâche ajoutée dans Mes actions. Ici, KPI et Mes
          actions démarrent simplement en haut de leur colonne respective : ils s'alignent
          visuellement sans que la hauteur de l'un dépende de l'autre. */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 340px', gap: 18, overflow: 'hidden' }}>
        {/* Colonne gauche */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14, flexShrink: 0 }}>
        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 10.5, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Budget prévisionnel</p>
            <p style={{ margin: '0 0 1px', fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatCurrency(totalPrev)}</p>
            <p style={{ margin: 0, fontSize: 10.5, color: 'var(--color-text-secondary)' }}>tous projets</p>
            {totalPrevExterne > 0 && (
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--color-warning)', fontWeight: 500 }}>
                dont externe : {formatCurrency(totalPrevExterne)} ({pctPrevExterne}%)
              </p>
            )}
          </div>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--color-info-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={13} color="var(--color-info)" />
          </div>
        </div>

        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 10.5, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Budget consommé</p>
            <p style={{ margin: '0 0 1px', fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{formatCurrency(totalConso)}</p>
            <p style={{ margin: 0, fontSize: 10.5, color: 'var(--color-text-secondary)' }}>{totalPrev > 0 ? `${pctConso}% consommé` : '—'}</p>
            {totalConsoExterne > 0 && (
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--color-warning)', fontWeight: 500 }}>
                dont externe : {formatCurrency(totalConsoExterne)} ({pctConsoExterne}%)
              </p>
            )}
          </div>
          {totalPrev > 0 && <CircularProgress value={pctConso} size={30} strokeWidth={4} />}
        </div>

        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 10.5, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Charge planifiée</p>
            <p style={{ margin: '0 0 1px', fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{fmtJours(totalJours)} j</p>
            <p style={{ margin: 0, fontSize: 10.5, color: 'var(--color-text-secondary)' }}>jours prévisionnels</p>
            {totalJoursExterne > 0 && (
              <p style={{ margin: '2px 0 0', fontSize: 10.5, color: 'var(--color-warning)', fontWeight: 500 }}>
                dont externe : {fmtJours(totalJoursExterne)} j ({pctJoursExterne}%)
              </p>
            )}
          </div>
          <div style={{ width: 26, height: 26, borderRadius: 8, background: 'var(--color-bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CalendarClock size={13} color="#7F77DD" />
          </div>
        </div>

        <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: '9px 12px', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p style={{ margin: '0 0 2px', fontSize: 10.5, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Risques ouverts</p>
            <p style={{ margin: '0 0 1px', fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)' }}>{risquesOuverts}</p>
            <p style={{ margin: 0, fontSize: 10.5, color: risquesCritiques > 0 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
              {risquesCritiques > 0 ? `${risquesCritiques} critiques` : 'Aucun critique'}
            </p>
          </div>
          <div style={{
            width: 26, height: 26, borderRadius: 8, flexShrink: 0,
            background: risquesCritiques > 0 ? 'var(--color-danger-soft)' : risquesOuverts > 0 ? 'var(--color-warning-soft)' : 'var(--color-bg-tertiary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangleIcon size={13} color={risquesCritiques > 0 ? 'var(--color-danger)' : risquesOuverts > 0 ? 'var(--color-warning)' : 'var(--color-text-tertiary)'} />
          </div>
        </div>
          </div>
          {/* Projets — scroll interne borné à ce bloc (pas partagé avec Facturation en dessous,
              ni avec les KPI au-dessus) : Facturation reste toujours visible, et ajouter des
              tâches dans Mes actions (colonne de droite) n'a aucun effet sur cette colonne. */}
          <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>Projets</h3>
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-secondary)' }}>
                  {['Projet', 'Avancement', 'Budget', 'Statut'].map((h) => (
                    <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', position: 'sticky', top: 0, background: 'var(--color-bg-secondary)', borderBottom: '0.5px solid var(--color-border-soft)', zIndex: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {projetsGestion.map((p) => {
                  const isRun = p.type === 'RUN';
                  const av = calculerAvancementProjet(p);
                  const b = calculerBudgetProjet(p);
                  const suiviRun = isRun ? suiviRunAnneeCourante(p) : null;
                  const badge = statutBadge(p);
                  return (
                    <tr
                      key={p.id}
                      // Sanity Check n'est plus dans les onglets visibles par un Collaborateur
                      // (cf. ProjetLayout.jsx) : on l'envoie directement sur WBS pour ne pas le
                      // faire atterrir sur une page sans onglet actif dans sa propre navigation.
                      onClick={() => navigate(`/projet/${p.id}/${isRun ? 'suivi-mensuel' : (isCollabSur(p.id) ? 'wbs' : 'sanity')}`)}
                      style={{ borderBottom: '0.5px solid var(--color-border-soft)', cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    >
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, fontSize: 12 }}>{p.nom}</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 14px', width: 160 }}>
                        {isRun ? (
                          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ProgressBar value={av} color={p.couleur} />
                            <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', flexShrink: 0 }}>{av}%</span>
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                        {isRun
                          ? (suiviRun.cmdNbj > 0 ? <>{fmtJours(suiviRun.consoNbj)} / {fmtJours(suiviRun.cmdNbj)} j</> : '—')
                          : (b.prev > 0 ? <>{formatCurrency(b.conso)} / {formatCurrency(b.prev)}</> : '—')}
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <Badge label={badge.label} variant={badge.variant} />
                          <ChevronRight size={14} color="var(--color-text-tertiary)" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {projetsGestion.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>Aucun projet où vous êtes chef de projet.</td></tr>
                )}
              </tbody>
            </table>
            </div>
          </div>

          {/* V2 — Widget Facturation — carte séparée, toujours visible (flexShrink:0, hors du
              scroll de Projets) plutôt que de scroller avec le tableau au-dessus. */}
          {toutesFactures.length > 0 && (
            <div style={{ flexShrink: 0, marginTop: 14 }}>
              <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600 }}>Facturation — Vue globale</h3>
              <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'hidden' }}>
                {/* KPIs facturation */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                  {[
                    { label: 'Total facturé', value: formatCurrency(factTotalFacture), color: 'var(--color-text-primary)' },
                    { label: 'Encaissé', value: formatCurrency(factEncaisse), color: 'var(--color-success)' },
                    { label: 'En attente', value: formatCurrency(factEnAttente), color: 'var(--color-warning)' },
                    { label: 'En retard', value: formatCurrency(factEnRetard.reduce((s, f) => s + montantFacture(f), 0)), color: factEnRetard.length > 0 ? 'var(--color-danger)' : 'var(--color-text-tertiary)' },
                  ].map((kpi, i) => (
                    <div key={kpi.label} style={{ padding: '14px 18px', borderRight: i < 3 ? '0.5px solid var(--color-border-soft)' : 'none' }}>
                      <p style={{ margin: '0 0 4px', fontSize: 11, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{kpi.label}</p>
                      <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: kpi.color }}>{kpi.value}</p>
                    </div>
                  ))}
                </div>
                {/* Factures en retard */}
                {factEnRetard.length > 0 && (
                  <div style={{ borderTop: '0.5px solid var(--color-border-soft)', padding: '10px 18px' }}>
                    <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: 'var(--color-danger)' }}>Factures en retard de paiement</p>
                    <div style={{ maxHeight: 110, overflowY: 'auto' }}>
                      {/* auto-fit (pas auto-fill) : avec peu de factures, auto-fill réserve quand
                          même des colonnes vides et coince chaque ligne dans ~220px de large,
                          ce qui faisait passer "FAC-2026-001" à la ligne caractère par caractère.
                          auto-fit supprime les colonnes vides et étire les lignes existantes. */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '4px 24px' }}>
                        {factEnRetard.map((f) => (
                          <div
                            key={f.id}
                            onClick={() => navigate(`/projet/${f.projetId}/facturation`)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', cursor: 'pointer', fontSize: 12, minWidth: 0 }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.projetCouleur, flexShrink: 0 }} />
                            <span style={{ fontFamily: 'monospace', color: 'var(--color-danger)', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>{f.numero}</span>
                            <span style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }}>—</span>
                            <span style={{ color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.projetNom}</span>
                            <span style={{ fontWeight: 600, color: 'var(--color-danger)', marginLeft: 'auto', flexShrink: 0 }}>{formatCurrency(montantFacture(f))}</span>
                            <span style={{ color: 'var(--color-danger)', flexShrink: 0 }}>éch. {new Date(f.date_echeance).toLocaleDateString('fr-FR')} ⚠</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Colonne droite */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
          {/* Mes actions — en haut de la colonne (aligné avec les KPI), hors du scroll partagé
              plus bas. Enveloppé dans un div : MesActions retourne un Fragment (titre + carte),
              et sans ce conteneur ses deux enfants seraient traités comme deux enfants directs
              de la colonne au lieu de rester groupés. */}
          {canUseTaches && <div style={{ flexShrink: 0, marginBottom: 14 }}><MesActions /></div>}

          {/* Un seul scroll interne pour Jalons + Parties prenantes. */}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Milestones — dans le scroll partagé de la colonne, tous affichés (déjà plafonnés à
              10 en amont), pas de mini-scroll dédié. */}
          <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>Prochains jalons</h3>
          <div style={{ flexShrink: 0, background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, marginBottom: 14 }}>
            {milestones.length === 0 && (
              <p style={{ padding: 18, textAlign: 'center', color: 'var(--color-text-tertiary)', margin: 0 }}>Aucun jalon à venir</p>
            )}
            {milestones.map((m, i, arr) => {
              const late = new Date(m.date_prevue) < today && m.statut !== 'atteint';
              return (
                <div key={m.id} style={{
                  padding: '8px 14px',
                  borderBottom: i < arr.length - 1 ? '0.5px solid var(--color-border-soft)' : 'none',
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

          {/* V2 — Stakeholders à contacter — dans le scroll partagé de la colonne, tous affichés. */}
          <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, flexShrink: 0 }}>Parties prenantes à contacter</h3>
          <div style={{ flexShrink: 0, background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12 }}>
            {stakeholdersAContacter.length === 0 && (
              <p style={{ padding: 16, textAlign: 'center', color: 'var(--color-text-tertiary)', margin: 0, fontSize: 12 }}>Aucun contact en attente</p>
            )}
            {stakeholdersAContacter.map((sh, i, arr) => (
              <div key={sh.id} style={{
                padding: '7px 14px',
                borderBottom: i < arr.length - 1 ? '0.5px solid var(--color-border-soft)' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: sh.projetCouleur, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--color-text-primary)' }}>
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
                      flexShrink: 0, fontSize: 11, padding: '2px 7px', borderRadius: 5,
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
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}

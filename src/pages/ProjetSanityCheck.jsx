import { useParams, NavLink } from 'react-router-dom';
import { AlertTriangle, Ban, CalendarClock, Users, DollarSign, UserX, Wallet, CalendarX } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { calculerBudgetProjet, formatCurrency } from '../data/calculations';
import { PROBABILITE_LEVELS, IMPACT_LEVELS } from '../utils/riadCalculs';
import PageHeader from '../components/layout/PageHeader';

const PROBA_VALEUR = Object.fromEntries(PROBABILITE_LEVELS.map((p) => [p.key, p.valeur]));
const IMPACT_VALEUR = Object.fromEntries(IMPACT_LEVELS.map((i) => [i.key, i.valeur]));

function fmtJours(n) {
  const v = Math.round(n * 10) / 10;
  return `${v % 1 === 0 ? v : v.toFixed(1).replace('.', ',')} j`;
}

function KpiCard({ icon: Icon, label, prevLabel, prevValue, realLabel, realValue, delta, deltaFmt, deltaGoodIfPositive = true }) {
  const deltaOk = deltaGoodIfPositive ? delta >= 0 : delta <= 0;
  return (
    <div style={{
      background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12,
      padding: '16px 18px', flex: 1, minWidth: 240,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon size={15} color="var(--color-text-tertiary)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{prevLabel}</p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{prevValue}</p>
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>{realLabel}</p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{realValue}</p>
        </div>
        <div>
          <p style={{ margin: '0 0 2px', fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Delta</p>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: deltaOk ? 'var(--color-success)' : 'var(--color-danger)' }}>
            {delta > 0 ? '+' : ''}{deltaFmt}
          </p>
        </div>
      </div>
    </div>
  );
}

function PanelSection({ icon: Icon, title, count, tone = 'neutral', children, action }) {
  const toneColor = tone === 'danger' ? 'var(--color-danger)' : tone === 'warning' ? 'var(--color-warning)' : 'var(--color-text-tertiary)';
  return (
    <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, padding: '14px 16px', flex: 1, minWidth: 280 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <Icon size={14} color={count > 0 ? toneColor : 'var(--color-text-tertiary)'} />
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</span>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '1px 7px', borderRadius: 99,
            background: count > 0 ? `color-mix(in srgb, ${toneColor} 15%, transparent)` : 'var(--color-bg-tertiary)',
            color: count > 0 ? toneColor : 'var(--color-text-tertiary)',
          }}>{count}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ text = 'Rien à signaler.' }) {
  return <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)', padding: '4px 0' }}>{text}</p>;
}

const listItem = { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5, borderBottom: '0.5px solid var(--color-border-soft)' };
const linkStyle = { fontSize: 11.5, fontWeight: 600, color: 'var(--color-info)', textDecoration: 'none' };

export default function ProjetSanityCheck() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const collaborateurs = useAppStore((s) => s.collaborateurs);

  if (!projet) return null;

  const feuilles = projet.wbs.filter((n) => !projet.wbs.some((c) => c.parent_id === n.id) && n.type !== 'jalon');
  const joursPrev = feuilles.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + (a.jours_prev || 0), 0), 0);
  const joursReel = feuilles.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + (a.jours_realises || 0), 0), 0);
  const deltaJours = joursPrev - joursReel;

  const budget = calculerBudgetProjet(projet);
  const deltaBudget = budget.prev - budget.conso;

  // Risques ouverts / critiques
  const risques = projet.riad?.risques || [];
  const risquesOuverts = risques.filter((r) => r.status !== 'cloture');
  const risquesCritiques = risquesOuverts.filter((r) => (PROBA_VALEUR[r.probabilite] || 0) * (IMPACT_VALEUR[r.impact] || 0) > 16);

  // Jalons en retard (milestones + livrables WBS épinglés)
  const todayISO = new Date().toISOString().slice(0, 10);
  const jalonsRetard = [
    ...(projet.milestones || []).map((m) => ({ id: m.id, nom: m.nom, date_prevue: m.date_prevue, statut: m.statut })),
    ...projet.wbs
      .filter((n) => n.epingle_dashboard && n.date_fin_prev && n.statut !== 'termine')
      .map((n) => ({ id: n.id, nom: n.nom, date_prevue: n.date_fin_prev, statut: n.statut })),
  ]
    .filter((m) => m.statut !== 'atteint' && m.date_prevue && m.date_prevue < todayISO)
    .sort((a, b) => a.date_prevue.localeCompare(b.date_prevue));

  // Tâches bloquées
  const tachesBloquees = projet.wbs.filter((n) => n.statut === 'bloque');

  // Qualité de données
  const sansCollab = feuilles.filter((n) => (n.affectations || []).length === 0);
  const sansTjm = feuilles.filter((n) => (n.affectations || []).some((a) => {
    const t = projet.tjm.find((x) => x.collaborateur_id === a.collaborateur_id);
    return !t || !t.montant;
  }));
  const sansDates = feuilles.filter((n) => !n.date_debut_prev || !n.date_fin_prev);

  const nomCollab = (cid) => {
    const c = collaborateurs.find((x) => x.id === cid);
    return c ? `${c.prenom} ${c.nom}` : '—';
  };

  return (
    <div style={{ padding: 32 }}>
      <PageHeader title="Sanity Check" subtitle="Vue d'ensemble santé projet : avancement, budget, risques et qualité des données." />

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <KpiCard
          icon={CalendarClock} label="Jours"
          prevLabel="Prévisionnel" prevValue={fmtJours(joursPrev)}
          realLabel="Réalisé" realValue={fmtJours(joursReel)}
          delta={deltaJours} deltaFmt={fmtJours(Math.abs(deltaJours))} deltaGoodIfPositive={true}
        />
        <KpiCard
          icon={Wallet} label="Budget"
          prevLabel="Prévisionnel" prevValue={formatCurrency(budget.prev)}
          realLabel="Consommé" realValue={formatCurrency(budget.conso)}
          delta={deltaBudget} deltaFmt={formatCurrency(Math.abs(deltaBudget))} deltaGoodIfPositive={true}
        />
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <PanelSection
          icon={AlertTriangle} title="Risques ouverts" count={risquesOuverts.length}
          tone={risquesCritiques.length > 0 ? 'danger' : risquesOuverts.length > 0 ? 'warning' : 'neutral'}
          action={<NavLink to={`/projet/${id}/risques`} style={linkStyle}>Voir RIAD →</NavLink>}
        >
          {risquesOuverts.length === 0 && <EmptyRow />}
          {risquesCritiques.length > 0 && (
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 600, color: 'var(--color-danger)' }}>{risquesCritiques.length} critique(s)</p>
          )}
          {risquesOuverts.slice(0, 5).map((r) => {
            const critique = (PROBA_VALEUR[r.probabilite] || 0) * (IMPACT_VALEUR[r.impact] || 0) > 16;
            return (
              <div key={r.id} style={listItem}>
                <span style={{ color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.description}</span>
                {critique && <span style={{ color: 'var(--color-danger)', fontWeight: 600, flexShrink: 0 }}>Critique</span>}
              </div>
            );
          })}
          {risquesOuverts.length > 5 && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>+{risquesOuverts.length - 5} autres</p>}
        </PanelSection>

        <PanelSection
          icon={CalendarClock} title="Jalons en retard" count={jalonsRetard.length}
          tone={jalonsRetard.length > 0 ? 'danger' : 'neutral'}
        >
          {jalonsRetard.length === 0 && <EmptyRow />}
          {jalonsRetard.slice(0, 5).map((m) => (
            <div key={m.id} style={listItem}>
              <span style={{ color: 'var(--color-text-primary)' }}>{m.nom}</span>
              <span style={{ color: 'var(--color-danger)', flexShrink: 0 }}>{new Date(m.date_prevue).toLocaleDateString('fr-FR')}</span>
            </div>
          ))}
          {jalonsRetard.length > 5 && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>+{jalonsRetard.length - 5} autres</p>}
        </PanelSection>

        <PanelSection
          icon={Ban} title="Tâches bloquées" count={tachesBloquees.length}
          tone={tachesBloquees.length > 0 ? 'warning' : 'neutral'}
          action={<NavLink to={`/projet/${id}/kanban`} style={linkStyle}>Voir Kanban →</NavLink>}
        >
          {tachesBloquees.length === 0 && <EmptyRow />}
          {tachesBloquees.slice(0, 5).map((n) => (
            <div key={n.id} style={listItem}><span style={{ color: 'var(--color-text-primary)' }}>{n.nom}</span></div>
          ))}
          {tachesBloquees.length > 5 && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>+{tachesBloquees.length - 5} autres</p>}
        </PanelSection>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Qualité des données</h3>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <PanelSection
          icon={UserX} title="Sans collaborateur affecté" count={sansCollab.length}
          tone={sansCollab.length > 0 ? 'warning' : 'neutral'}
          action={<NavLink to={`/projet/${id}/wbs`} style={linkStyle}>Voir WBS →</NavLink>}
        >
          {sansCollab.length === 0 && <EmptyRow />}
          {sansCollab.slice(0, 5).map((n) => (
            <div key={n.id} style={listItem}><span style={{ color: 'var(--color-text-primary)' }}>{n.nom}</span></div>
          ))}
          {sansCollab.length > 5 && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>+{sansCollab.length - 5} autres</p>}
        </PanelSection>

        <PanelSection
          icon={DollarSign} title="Sans TJM" count={sansTjm.length}
          tone={sansTjm.length > 0 ? 'warning' : 'neutral'}
          action={<NavLink to={`/projet/${id}/parametres`} style={linkStyle}>Voir Paramètres →</NavLink>}
        >
          {sansTjm.length === 0 && <EmptyRow />}
          {sansTjm.slice(0, 5).map((n) => (
            <div key={n.id} style={listItem}>
              <span style={{ color: 'var(--color-text-primary)' }}>{n.nom}</span>
              <span style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                {(n.affectations || []).map((a) => nomCollab(a.collaborateur_id)).join(', ')}
              </span>
            </div>
          ))}
          {sansTjm.length > 5 && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>+{sansTjm.length - 5} autres</p>}
        </PanelSection>

        <PanelSection
          icon={CalendarX} title="Sans dates prévisionnelles" count={sansDates.length}
          tone={sansDates.length > 0 ? 'warning' : 'neutral'}
          action={<NavLink to={`/projet/${id}/wbs`} style={linkStyle}>Voir WBS →</NavLink>}
        >
          {sansDates.length === 0 && <EmptyRow />}
          {sansDates.slice(0, 5).map((n) => (
            <div key={n.id} style={listItem}><span style={{ color: 'var(--color-text-primary)' }}>{n.nom}</span></div>
          ))}
          {sansDates.length > 5 && <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--color-text-tertiary)' }}>+{sansDates.length - 5} autres</p>}
        </PanelSection>
      </div>

      <p style={{ marginTop: 20, fontSize: 11, color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Users size={12} /> Le détail CPI/SPI se trouve dans le bandeau en haut de page.
      </p>
    </div>
  );
}

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { calculerPlageJours, construireLignesResume, exporterResumeExcel } from '../utils/resumeExport';
import PageHeader from '../components/layout/PageHeader';
import Badge from '../components/ui/Badge';

const STATUT_LABELS = { non_demarre: 'Non démarré', en_cours: 'En cours', termine: 'Terminé', bloque: 'Bloqué' };
const fmtJours = (n) => (n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const isWeekendIso = (iso) => { const day = new Date(iso).getDay(); return day === 0 || day === 6; };

// Vue de synthèse en lecture seule : arbre des tâches indenté par niveau, avec le détail des
// imputations jour par jour + collaborateur. Pensée pour être exportée et partagée avec le
// client — pas d'édition possible ici. `vue` (prev/réel/les deux) pilote à la fois l'affichage
// écran et l'export Excel, même principe que le picklist de Planning.
export default function ProjetResume() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const [vue, setVue] = useState('reel'); // 'reel' | 'prev' | 'les_deux'
  const showPrev = vue === 'prev' || vue === 'les_deux';
  const showReel = vue === 'reel' || vue === 'les_deux';

  const jours = calculerPlageJours(projet, vue);
  const lignes = construireLignesResume(projet, collaborateurs, jours);
  const totalPrev = lignes.filter((l) => l.isLeaf).reduce((s, l) => s + l.chargePrev, 0);
  const totalReel = lignes.filter((l) => l.isLeaf).reduce((s, l) => s + l.chargeReelle, 0);
  const sousTitreCharge = vue === 'les_deux'
    ? `${fmtJours(totalPrev)}j prévisionnel(le)s / ${fmtJours(totalReel)}j réel(le)s au total`
    : vue === 'prev'
      ? `${fmtJours(totalPrev)}j de charge prévisionnelle au total`
      : `${fmtJours(totalReel)}j de charge réelle au total`;

  return (
    <div style={{ padding: 32 }}>
      <PageHeader
        title="Résumé"
        subtitle={`${lignes.length} ligne${lignes.length > 1 ? 's' : ''} — ${sousTitreCharge}${jours.length > 0 ? ` — ${jours.length} jour(s) imputé(s)` : ''}`}
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', background: 'var(--color-bg-tertiary)', borderRadius: 8, padding: 3, gap: 2 }}>
              {[['prev', '📘 Prév.'], ['reel', '📙 Réel'], ['les_deux', '📊 Les deux']].map(([v, label]) => (
                <button key={v} onClick={() => setVue(v)} style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 500,
                  background: vue === v ? 'var(--color-bg-card)' : 'transparent',
                  color: vue === v ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                  boxShadow: vue === v ? '0 1px 3px var(--color-border)' : 'none',
                }}>{label}</button>
              ))}
            </div>
            <button
              onClick={() => exporterResumeExcel(projet, collaborateurs, vue)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                borderRadius: 8, border: 'none', background: 'var(--color-text-primary)', color: 'var(--color-bg-primary)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Download size={14} /> Exporter vers Excel
            </button>
          </div>
        }
      />

      <div style={{ background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 12, overflow: 'auto', maxWidth: '100%' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '0.5px solid var(--color-border-soft)' }}>
              <th style={{ ...thFixe, left: 0, width: 50 }}>#</th>
              <th style={{ ...thFixe, left: 50, width: 300, textAlign: 'left' }}>Tâche</th>
              <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', width: 200 }}>Collaborateur</th>
              {showPrev && <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', width: 110 }}>Charge prév.</th>}
              {showReel && <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', width: 110 }}>Charge réelle</th>}
              <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', width: 110 }}>Statut</th>
              {jours.map((iso) => (
                <th key={iso} style={{
                  padding: '6px 2px', textAlign: 'center', fontSize: 9, fontWeight: 500, color: 'var(--color-text-tertiary)', width: 34,
                  background: isWeekendIso(iso) ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                }}>
                  {new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.id} style={{ borderBottom: i < lignes.length - 1 ? '0.5px solid var(--color-border-soft)' : 'none', background: l.depth === 0 ? 'var(--color-bg-secondary)' : 'var(--color-bg-card)' }}>
                <td style={{ ...tdFixe, left: 0, width: 50, background: l.depth === 0 ? 'var(--color-bg-secondary)' : 'var(--color-bg-card)' }}>{l.numero}</td>
                <td style={{ ...tdFixe, left: 50, width: 300, textAlign: 'left', paddingLeft: 8 + l.depth * 20, fontWeight: l.isLeaf ? 400 : 600, background: l.depth === 0 ? 'var(--color-bg-secondary)' : 'var(--color-bg-card)' }}>
                  {l.nom}
                </td>
                <td style={{ padding: '8px', fontSize: 12, color: 'var(--color-text-secondary)', verticalAlign: 'top' }}>
                  {l.collaborateurs.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {l.collaborateurs.map((c) => (
                        <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--color-bg-tertiary)', borderRadius: 99, padding: '1px 8px 1px 1px', whiteSpace: 'nowrap' }}>
                          <span style={{ width: 16, height: 16, borderRadius: '50%', background: c.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#FFFFFF', flexShrink: 0 }}>
                            {c.initiales}
                          </span>
                          {c.prenom} {c.nom}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                {showPrev && (
                  <td style={{ padding: '8px', fontSize: 13, fontWeight: 600, color: l.chargePrev > 0 ? 'var(--color-info)' : 'var(--color-text-tertiary)', textAlign: 'right', verticalAlign: 'top' }}>
                    {l.chargePrev > 0 ? `${fmtJours(l.chargePrev)}j` : '—'}
                  </td>
                )}
                {showReel && (
                  <td style={{ padding: '8px', fontSize: 13, fontWeight: 600, color: l.chargeReelle > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)', textAlign: 'right', verticalAlign: 'top' }}>
                    {l.chargeReelle > 0 ? `${fmtJours(l.chargeReelle)}j` : '—'}
                  </td>
                )}
                <td style={{ padding: '8px', verticalAlign: 'top' }}>
                  <Badge label={STATUT_LABELS[l.statut] || l.statut} variant={l.statut} />
                </td>
                {jours.map((iso) => {
                  const { prev, reel } = l.parJour[iso];
                  const wknd = isWeekendIso(iso);
                  return (
                    <td key={iso} style={{
                      textAlign: 'center', fontSize: 10, padding: '4px 0', lineHeight: 1.3,
                      background: wknd ? 'var(--color-bg-tertiary)' : (prev > 0 || reel > 0) ? 'var(--color-info-soft)' : 'transparent',
                    }}>
                      {showPrev && prev > 0 && <div style={{ color: 'var(--color-info)', fontWeight: showReel ? 400 : 600 }}>{fmtJours(prev)}</div>}
                      {showReel && reel > 0 && <div style={{ color: reel > prev && showPrev ? 'var(--color-warning)' : 'var(--color-text-primary)', fontWeight: 600 }}>{fmtJours(reel)}</div>}
                    </td>
                  );
                })}
              </tr>
            ))}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={4 + (showPrev ? 1 : 0) + (showReel ? 1 : 0) + jours.length} style={{ padding: '24px 8px', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>
                  Aucune tâche pour ce projet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thFixe = {
  position: 'sticky', zIndex: 2, background: 'var(--color-bg-secondary)',
  padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)',
  borderRight: '1px solid var(--color-border)',
};
const tdFixe = {
  position: 'sticky', zIndex: 1,
  padding: '8px', fontSize: 13, color: 'var(--color-text-primary)', verticalAlign: 'top',
  borderRight: '1px solid var(--color-border)',
};

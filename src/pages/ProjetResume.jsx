import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { flattenWBS, calculerNumeroWBS, getLeaves } from '../data/calculations';
import { exporterResumeExcel } from '../utils/resumeExport';
import PageHeader from '../components/layout/PageHeader';
import Badge from '../components/ui/Badge';

const STATUT_LABELS = { non_demarre: 'Non démarré', en_cours: 'En cours', termine: 'Terminé', bloque: 'Bloqué' };
const fmtJours = (n) => (n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });

// Charge réelle d'un nœud : directe pour une feuille, somme des feuilles descendantes pour un
// livrable/parent — même logique que Planning/Budget (voir aussi resumeExport.js pour l'export).
function chargeReelleNoeud(node, allNodes) {
  return getLeaves(node, allNodes)
    .flatMap((l) => l.affectations || [])
    .reduce((s, a) => s + (a.jours_realises || 0), 0);
}

function collaborateursNoeud(node, allNodes, collaborateurs) {
  if (allNodes.some((n) => n.parent_id === node.id)) return null;
  const affs = (node.affectations || [])
    .map((a) => collaborateurs.find((c) => c.id === a.collaborateur_id))
    .filter(Boolean);
  return affs;
}

// Vue de synthèse en lecture seule : arbre des tâches indenté par niveau, uniquement la charge
// réelle (pas de prévisionnel) + collaborateur — pensée pour être exportée et partagée avec le
// client. Pas d'édition possible ici, volontairement (c'est un export, pas un outil de saisie).
export default function ProjetResume() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const collaborateurs = useAppStore((s) => s.collaborateurs);

  const numeros = calculerNumeroWBS(projet.wbs);
  const lignes = flattenWBS(projet.wbs);
  const totalCharge = projet.wbs
    .filter((n) => !projet.wbs.some((c) => c.parent_id === n.id))
    .flatMap((n) => n.affectations || [])
    .reduce((s, a) => s + (a.jours_realises || 0), 0);

  return (
    <div style={{ padding: 32 }}>
      <PageHeader
        title="Résumé"
        subtitle={`${lignes.length} ligne${lignes.length > 1 ? 's' : ''} — ${fmtJours(totalCharge)}j de charge réelle au total`}
        actions={
          <button
            onClick={() => exporterResumeExcel(projet, collaborateurs)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
              borderRadius: 8, border: 'none', background: '#1A1A18', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Download size={14} /> Exporter vers Excel
          </button>
        }
      />

      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
              <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#888780', width: 60 }}>#</th>
              <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#888780' }}>Tâche</th>
              <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#888780', width: 220 }}>Collaborateur</th>
              <th style={{ padding: '10px 8px', textAlign: 'right', fontSize: 11, fontWeight: 500, color: '#888780', width: 130 }}>Charge réelle</th>
              <th style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#888780', width: 130 }}>Statut</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(({ node, depth }, i) => {
              const isLeaf = !projet.wbs.some((n) => n.parent_id === node.id);
              const charge = chargeReelleNoeud(node, projet.wbs);
              const collabs = collaborateursNoeud(node, projet.wbs, collaborateurs);
              return (
                <tr key={node.id} style={{ borderBottom: i < lignes.length - 1 ? '0.5px solid rgba(0,0,0,0.06)' : 'none' }}>
                  <td style={{ padding: '8px', fontSize: 11, color: '#888780', fontFamily: 'monospace', verticalAlign: 'top' }}>
                    {numeros[node.id]}
                  </td>
                  <td style={{ padding: '8px', paddingLeft: 8 + depth * 20, fontSize: 13, color: '#1A1A18', fontWeight: isLeaf ? 400 : 600, verticalAlign: 'top' }}>
                    {node.nom}
                  </td>
                  <td style={{ padding: '8px', fontSize: 12, color: '#5F5E5A', verticalAlign: 'top' }}>
                    {collabs && collabs.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {collabs.map((c) => (
                          <span key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#F1EFE8', borderRadius: 99, padding: '1px 8px 1px 1px' }}>
                            <span style={{ width: 16, height: 16, borderRadius: '50%', background: c.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff' }}>
                              {c.initiales}
                            </span>
                            {c.prenom} {c.nom}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px', fontSize: 13, fontWeight: 600, color: charge > 0 ? '#1A1A18' : '#BDBCB8', textAlign: 'right', verticalAlign: 'top' }}>
                    {charge > 0 ? `${fmtJours(charge)}j` : '—'}
                  </td>
                  <td style={{ padding: '8px', verticalAlign: 'top' }}>
                    <Badge label={STATUT_LABELS[node.statut] || node.statut} variant={node.statut} />
                  </td>
                </tr>
              );
            })}
            {lignes.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: '24px 8px', textAlign: 'center', color: '#888780', fontSize: 13 }}>
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

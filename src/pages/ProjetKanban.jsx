import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { useAuth } from '../hooks/useAuth';
import { calculerNumeroWBS } from '../data/calculations';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import PageHeader from '../components/layout/PageHeader';

const COLONNES = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'À faire' },
  { id: 'en_cours', label: 'En cours' },
  { id: 'review', label: 'En révision' },
  { id: 'done', label: 'Terminé' },
];

const STATUT_LABELS = { non_demarre: 'Non démarré', en_cours: 'En cours', termine: 'Terminé', bloque: 'Bloqué' };

function KanbanCard({ node, projet, numero, collaborateurs }) {
  const updateWBSNode = useAppStore((s) => s.updateWBSNode);
  const { user, userDoc } = useAuth();
  const isCollab = userDoc?.role === 'collaborateur';
  // Cherche le profil collaborateur par user_id (plus fiable que collaborateur_id sur userDoc)
  const myCollab = collaborateurs.find((c) => c.user_id === user?.uid);
  const myCollabId = myCollab?.id || userDoc?.collaborateur_id;
  const canDrag = !isCollab || (node.affectations || []).some((a) => a.collaborateur_id === myCollabId);
  const affs = (node.affectations || []).map((a) => collaborateurs.find((c) => c.id === a.collaborateur_id)).filter(Boolean);

  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => canDrag && e.dataTransfer.setData('nodeId', node.id)}
      style={{
        background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 8, padding: 12,
        marginBottom: 8, cursor: canDrag ? 'grab' : 'default', userSelect: 'none',
        opacity: isCollab && !canDrag ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: '#888780', fontFamily: 'monospace' }}>{numero}</span>
        <Badge label={STATUT_LABELS[node.statut] || node.statut} variant={node.statut} />
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{node.nom}</p>
      {node.date_fin_prev && (
        <p style={{ margin: '0 0 6px', fontSize: 11, color: '#888780' }}>
          Fin prév. : {new Date(node.date_fin_prev).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {affs.map((c) => <Avatar key={c.id} collaborateur={c} size={20} />)}
        </div>
        {node.avancement > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 40, height: 3, background: '#E8E7E3', borderRadius: 99 }}>
              <div style={{ height: '100%', width: `${node.avancement}%`, background: projet.couleur, borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 10, color: '#888780' }}>{node.avancement}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProjetKanban() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const updateWBSNode = useAppStore((s) => s.updateWBSNode);

  const numeros = calculerNumeroWBS(projet.wbs);

  // Calcule les IDs accessibles depuis les racines (filtre les orphelins)
  const validIds = new Set();
  const addValid = (nodeId) => {
    if (validIds.has(nodeId)) return;
    validIds.add(nodeId);
    projet.wbs.filter((n) => n.parent_id === nodeId).forEach((n) => addValid(n.id));
  };
  projet.wbs.filter((n) => n.parent_id === null).forEach((n) => addValid(n.id));

  const childIds = new Set(projet.wbs.map((n) => n.parent_id).filter(Boolean));
  const taches = projet.wbs.filter((n) => n.type !== 'jalon' && validIds.has(n.id) && !childIds.has(n.id));

  // Dérive la colonne Kanban depuis kanban_colonne ou statut (synchro automatique)
  function getKanbanCol(node) {
    if (node.kanban_colonne) return node.kanban_colonne;
    if (node.statut === 'termine') return 'done';
    if (node.statut === 'en_cours') return 'en_cours';
    if (node.statut === 'bloque') return 'backlog';
    return 'backlog';
  }

  const handleDrop = (e, colonne) => {
    const nodeId = e.dataTransfer.getData('nodeId');
    if (!nodeId) return;
    const statut = colonne === 'done' ? 'termine' : colonne === 'en_cours' ? 'en_cours' : colonne === 'review' ? 'en_cours' : 'non_demarre';
    updateWBSNode(id, nodeId, { kanban_colonne: colonne, statut });
  };

  return (
    <div style={{ padding: 32 }}>
      <PageHeader title="Kanban" subtitle={`${taches.length} tâches`} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, minHeight: 400 }}>
        {COLONNES.map((col) => {
          const cards = taches.filter((n) => getKanbanCol(n) === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col.id)}
              style={{ background: '#F8F8F7', borderRadius: 10, padding: '12px 10px', minHeight: 200 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1A18' }}>{col.label}</span>
                <span style={{ fontSize: 11, color: '#888780', background: '#E8E7E3', borderRadius: 99, padding: '1px 6px' }}>{cards.length}</span>
              </div>
              {cards.map((n) => (
                <KanbanCard key={n.id} node={n} projet={projet} numero={numeros[n.id]} collaborateurs={collaborateurs} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

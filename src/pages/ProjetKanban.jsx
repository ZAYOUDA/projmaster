import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { useAuth } from '../hooks/useAuth';
import { calculerNumeroWBS } from '../data/calculations';
import Avatar from '../components/ui/Avatar';
import Badge from '../components/ui/Badge';
import PageHeader from '../components/layout/PageHeader';

// Filtre à choix multiple (checkboxes) — bouton déclencheur affichant le nombre de valeurs
// sélectionnées, menu déroulant qui se ferme au clic en dehors.
function MultiSelectFilter({ label, options, selected, onChange }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!ouvert) return;
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [ouvert]);

  const toggle = (value) => {
    const next = new Set(selected);
    next.has(value) ? next.delete(value) : next.add(value);
    onChange(next);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 8, border: '0.5px solid var(--color-border)',
          background: selected.size > 0 ? 'var(--color-bg-tertiary)' : 'var(--color-bg-card)', color: 'var(--color-text-primary)',
          fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}
      >
        {label}{selected.size > 0 ? ` (${selected.size})` : ''}
        <ChevronDown size={12} />
      </button>
      {ouvert && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 30, minWidth: 190,
          background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 8,
          boxShadow: '0 4px 16px var(--color-shadow)', overflow: 'hidden', maxHeight: 260, overflowY: 'auto',
        }}>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => onChange(new Set())}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                border: 'none', borderBottom: '0.5px solid var(--color-border-soft)', background: 'var(--color-bg-card)',
                cursor: 'pointer', fontSize: 12, color: 'var(--color-danger)', fontWeight: 500,
              }}
            >
              Réinitialiser
            </button>
          )}
          {options.map((o) => (
            <label
              key={o.value}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px',
                cursor: 'pointer', fontSize: 12.5, color: 'var(--color-text-primary)',
              }}
            >
              <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

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
  const { user, userDoc, isCollabSur, isClient } = useAuth();
  // Rôle PAR PROJET, pas le rôle global (cf. ProjetWBS.jsx pour la même logique).
  const isCollab = isCollabSur(projet.id);
  // Cherche le profil collaborateur par user_id (plus fiable que collaborateur_id sur userDoc)
  const myCollab = collaborateurs.find((c) => c.user_id === user?.uid);
  const myCollabId = myCollab?.id || userDoc?.collaborateur_id;
  // Client (lecture seule) : jamais draggable, quel que soit le reste — le drag HTML5 n'est pas un
  // contrôle de formulaire, un <fieldset disabled> ne le bloquerait pas, d'où ce check explicite.
  const canDrag = !isClient && (!isCollab || (node.affectations || []).some((a) => a.collaborateur_id === myCollabId));
  const affs = (node.affectations || []).map((a) => collaborateurs.find((c) => c.id === a.collaborateur_id)).filter(Boolean);

  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => canDrag && e.dataTransfer.setData('nodeId', node.id)}
      style={{
        background: 'var(--color-bg-card)', border: '0.5px solid var(--color-border)', borderRadius: 8, padding: 12,
        marginBottom: 8, cursor: canDrag ? 'grab' : 'default', userSelect: 'none',
        opacity: isCollab && !canDrag ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>{numero}</span>
        <Badge label={STATUT_LABELS[node.statut] || node.statut} variant={node.statut} />
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>{node.nom}</p>
      {node.date_fin_prev && (
        <p style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          Fin prév. : {new Date(node.date_fin_prev).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {affs.map((c) => <Avatar key={c.id} collaborateur={c} size={20} />)}
        </div>
        {node.avancement > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 40, height: 3, background: 'var(--color-bg-tertiary)', borderRadius: 99 }}>
              <div style={{ height: '100%', width: `${node.avancement}%`, background: projet.couleur, borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{node.avancement}%</span>
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

  const [filterCollabs, setFilterCollabs] = useState(new Set());
  const [filterStatuts, setFilterStatuts] = useState(new Set());

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
  const taches = projet.wbs
    .filter((n) => n.type !== 'jalon' && validIds.has(n.id) && !childIds.has(n.id))
    .filter((n) => filterCollabs.size === 0 || (n.affectations || []).some((a) => filterCollabs.has(a.collaborateur_id)))
    .filter((n) => filterStatuts.size === 0 || filterStatuts.has(n.statut));

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
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <MultiSelectFilter
          label="Collaborateur"
          options={collaborateurs.filter((c) => c.actif).map((c) => ({ value: c.id, label: `${c.prenom} ${c.nom}` }))}
          selected={filterCollabs}
          onChange={setFilterCollabs}
        />
        <MultiSelectFilter
          label="Statut"
          options={Object.entries(STATUT_LABELS).map(([value, label]) => ({ value, label }))}
          selected={filterStatuts}
          onChange={setFilterStatuts}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12, minHeight: 400 }}>
        {COLONNES.map((col) => {
          const cards = taches.filter((n) => getKanbanCol(n) === col.id);
          return (
            <div
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDrop(e, col.id)}
              style={{ background: 'var(--color-bg-secondary)', borderRadius: 10, padding: '12px 10px', minHeight: 200 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>{col.label}</span>
                <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', background: 'var(--color-bg-tertiary)', borderRadius: 99, padding: '1px 6px' }}>{cards.length}</span>
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

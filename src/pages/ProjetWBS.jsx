import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { useAuth } from '../hooks/useAuth';
import { calculerNumeroWBS, calculerBudgetNoeud, formatCurrency } from '../data/calculations';
import PageHeader from '../components/layout/PageHeader';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import { Plus, ChevronRight, ChevronDown, Trash2, UserPlus, ClipboardPaste, CheckSquare, Calendar, GripVertical } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Jours réalisés par mois ──────────────────────────────────────
function JoursRealisesParMois({ projetId, nodeId, affId, jours_realises_par_mois = {}, jours_realises }) {
  const setChargeRealiseMois = useAppStore((s) => s.setChargeRealiseMois);
  const [showAdd, setShowAdd] = useState(false);
  const [newMois, setNewMois] = useState('');

  const entries = Object.entries(jours_realises_par_mois).sort(([a], [b]) => a.localeCompare(b));
  const today = new Date();
  const defaultMois = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#888780', fontWeight: 500 }}>
          J. réalisés : <strong style={{ color: '#1A1A18' }}>{jours_realises} j</strong>
        </span>
        {!showAdd && (
          <button
            onClick={() => { setShowAdd(true); setNewMois(defaultMois); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', cursor: 'pointer', color: '#5F5E5A' }}
          >
            <Calendar size={10} /> + Mois
          </button>
        )}
      </div>
      {entries.map(([mois, jours]) => {
        const [year, month] = mois.split('-');
        const label = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
        return (
          <div key={mois} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: '#5F5E5A', width: 72, flexShrink: 0 }}>{label}</span>
            <input
              type="number" min={0} step={0.5} defaultValue={jours}
              onBlur={(e) => setChargeRealiseMois(projetId, nodeId, affId, mois, parseFloat(e.target.value) || 0)}
              style={{ width: 52, padding: '3px 6px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)', fontSize: 11, outline: 'none' }}
            />
            <span style={{ fontSize: 11, color: '#888780' }}>j</span>
            <button onClick={() => setChargeRealiseMois(projetId, nodeId, affId, mois, 0)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D85A30', padding: 2, display: 'flex' }}>
              <Trash2 size={10} />
            </button>
          </div>
        );
      })}
      {showAdd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <input type="month" value={newMois} onChange={(e) => setNewMois(e.target.value)}
            style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)', fontSize: 11, outline: 'none' }} />
          <button onClick={() => {
            if (newMois && !jours_realises_par_mois[newMois]) setChargeRealiseMois(projetId, nodeId, affId, newMois, 0);
            setShowAdd(false);
          }} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: 'none', background: '#1A1A18', color: '#fff', cursor: 'pointer' }}>OK</button>
          <button onClick={() => setShowAdd(false)} style={{ fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  );
}

const STATUT_LABELS = { non_demarre: 'Non démarré', en_cours: 'En cours', termine: 'Terminé', bloque: 'Bloqué' };

// ── Panneau détail ───────────────────────────────────────────────
function DetailPanel({ projetId, nodeId, numeros }) {
  const projet = useAppStore((s) => s.projets.find((p) => p.id === projetId));
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const updateWBSNode = useAppStore((s) => s.updateWBSNode);
  const addAffectation = useAppStore((s) => s.addAffectation);
  const updateAffectation = useAppStore((s) => s.updateAffectation);
  const deleteAffectation = useAppStore((s) => s.deleteAffectation);
  const [addingCollab, setAddingCollab] = useState(false);
  const [newCollabId, setNewCollabId] = useState('');
  const { user, userDoc } = useAuth();

  const node = projet?.wbs.find((n) => n.id === nodeId);
  if (!node) return null;

  const isCollab = userDoc?.role === 'collaborateur';
  const myCollab = collaborateurs.find((c) => c.user_id === user?.uid);
  const myCollabId = myCollab?.id || userDoc?.collaborateur_id;
  const isAssigned = isCollab && (node.affectations || []).some((a) => a.collaborateur_id === myCollabId);
  const myAff = isCollab ? (node.affectations || []).find((a) => a.collaborateur_id === myCollabId) : null;

  const affectees = (node.affectations || []).map((a) => ({
    ...a,
    collab: collaborateurs.find((c) => c.id === a.collaborateur_id),
    tjm: projet.tjm.find((t) => t.collaborateur_id === a.collaborateur_id)?.montant || 0,
  }));
  const disponibles = collaborateurs.filter((c) => c.actif && !node.affectations.find((a) => a.collaborateur_id === c.id));
  const budget = calculerBudgetNoeud(node, projet.wbs, projet.tjm);

  // Vue collaborateur — tâche assignée : édition limitée
  if (isCollab && isAssigned) {
    return (
      <div style={{ padding: 4 }}>
        <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>{node.nom}</p>
        {node.description && <p style={{ margin: '0 0 12px', fontSize: 12, color: '#5F5E5A' }}>{node.description}</p>}
        <label style={{ ...labelStyle, marginBottom: 10 }}>Statut
          <select style={inputStyle} value={node.statut}
            onChange={(e) => updateWBSNode(projetId, node.id, { statut: e.target.value })}>
            {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label style={{ ...labelStyle, marginBottom: 10 }}>Avancement (%)
          <input type="number" min={0} max={100} style={inputStyle} value={node.avancement}
            onChange={(e) => updateWBSNode(projetId, node.id, { avancement: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) })} />
        </label>
        <label style={{ ...labelStyle, marginBottom: 10 }}>Colonne Kanban
          <select style={inputStyle} value={node.kanban_colonne || 'backlog'}
            onChange={(e) => updateWBSNode(projetId, node.id, { kanban_colonne: e.target.value })}>
            <option value="backlog">Backlog</option>
            <option value="todo">À faire</option>
            <option value="en_cours">En cours</option>
            <option value="review">En révision</option>
            <option value="done">Terminé</option>
          </select>
        </label>
        {myAff && (
          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.1)', paddingTop: 12, marginTop: 4 }}>
            <JoursRealisesParMois projetId={projetId} nodeId={node.id} affId={myAff.id}
              jours_realises_par_mois={myAff.jours_realises_par_mois || {}} jours_realises={myAff.jours_realises} />
          </div>
        )}
      </div>
    );
  }

  // Vue collaborateur — tâche non assignée : lecture seule
  if (isCollab && !isAssigned) {
    return (
      <div style={{ padding: 4 }}>
        <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>{node.nom}</p>
        {node.description && <p style={{ margin: '0 0 10px', fontSize: 12, color: '#5F5E5A' }}>{node.description}</p>}
        <div style={{ padding: '10px 12px', borderRadius: 8, background: '#F8F8F7', fontSize: 12, color: '#888780' }}>
          Vous n'êtes pas affecté à cette tâche.
        </div>
      </div>
    );
  }

  // Vue admin — édition complète
  return (
    <div style={{ padding: 4 }}>
      <label style={labelStyle}>Nom
        <input key={`nom-${node.id}`} style={inputStyle} defaultValue={node.nom}
          onBlur={(e) => { if (e.target.value !== node.nom) updateWBSNode(projetId, node.id, { nom: e.target.value }); }} />
      </label>
      <label style={{ ...labelStyle, marginTop: 10 }}>Description
        <textarea key={`desc-${node.id}`} style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          defaultValue={node.description}
          onBlur={(e) => updateWBSNode(projetId, node.id, { description: e.target.value })} />
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <label style={labelStyle}>Début prévu
          <input type="date" style={inputStyle} value={node.date_debut_prev || ''}
            onChange={(e) => updateWBSNode(projetId, node.id, { date_debut_prev: e.target.value || null })} />
        </label>
        <label style={labelStyle}>Fin prévue
          <input type="date" style={inputStyle} value={node.date_fin_prev || ''}
            onChange={(e) => updateWBSNode(projetId, node.id, { date_fin_prev: e.target.value || null })} />
        </label>
        <label style={labelStyle}>Début réel
          <input type="date" style={inputStyle} value={node.date_debut_reel || ''}
            onChange={(e) => updateWBSNode(projetId, node.id, { date_debut_reel: e.target.value || null })} />
        </label>
        <label style={labelStyle}>Fin réelle
          <input type="date" style={inputStyle} value={node.date_fin_reel || ''}
            onChange={(e) => updateWBSNode(projetId, node.id, { date_fin_reel: e.target.value || null })} />
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <label style={labelStyle}>Type
          <select style={inputStyle} value={node.type || 'tache'}
            onChange={(e) => updateWBSNode(projetId, node.id, { type: e.target.value })}>
            <option value="tache">Tâche</option>
            <option value="livrable">Livrable</option>
            <option value="jalon">Jalon 🔷</option>
          </select>
        </label>
        <label style={labelStyle}>Statut
          <select style={inputStyle} value={node.statut}
            onChange={(e) => updateWBSNode(projetId, node.id, { statut: e.target.value })}>
            {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label style={labelStyle}>Avancement (%)
          <input type="number" min={0} max={100} style={inputStyle} value={node.avancement}
            onChange={(e) => updateWBSNode(projetId, node.id, { avancement: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) })} />
        </label>
        <label style={labelStyle}>Kanban
          <select style={inputStyle} value={node.kanban_colonne}
            onChange={(e) => updateWBSNode(projetId, node.id, { kanban_colonne: e.target.value })}>
            <option value="backlog">Backlog</option>
            <option value="todo">À faire</option>
            <option value="en_cours">En cours</option>
            <option value="review">En révision</option>
            <option value="done">Terminé</option>
          </select>
        </label>
      </div>

      {/* Épingler sur dashboard */}
      {(!node.parent_id) && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 14, padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${node.epingle_dashboard ? '#378ADD' : 'rgba(0,0,0,0.10)'}`, background: node.epingle_dashboard ? '#EFF6FF' : '#F8F8F7' }}>
          <input type="checkbox" checked={!!node.epingle_dashboard}
            onChange={(e) => updateWBSNode(projetId, node.id, { epingle_dashboard: e.target.checked })}
            style={{ accentColor: '#378ADD', width: 14, height: 14 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#1A1A18' }}>📌 Afficher sur le dashboard</div>
            <div style={{ fontSize: 11, color: '#888780' }}>Apparaît dans "Prochains jalons" avec la date de fin prévue</div>
          </div>
        </label>
      )}

      {/* Affectations */}
      <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.1)', paddingTop: 14, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600 }}>Affectations</h4>
          {disponibles.length > 0 && (
            <button onClick={() => setAddingCollab(true)} style={iconBtnStyle}>
              <UserPlus size={13} style={{ marginRight: 4 }} /> Ajouter
            </button>
          )}
        </div>
        {affectees.map((a) => a.collab && (
          <div key={a.id} style={{ marginBottom: 8, background: '#F8F8F7', borderRadius: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px' }}>
              <Avatar collaborateur={a.collab} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{a.collab.prenom} {a.collab.nom}</p>
                <p style={{ margin: 0, fontSize: 11, color: '#888780' }}>TJM : {a.tjm} €/j</p>
              </div>
              <label style={{ ...labelStyle, width: 68, flexShrink: 0 }}>
                <span style={{ fontSize: 10 }}>J. prév.</span>
                <input type="number" min={0} step={0.5} style={{ ...inputStyle, padding: '4px 6px' }}
                  value={a.jours_prev}
                  onChange={(e) => updateAffectation(projetId, node.id, a.id, { jours_prev: parseFloat(e.target.value) || 0 })} />
              </label>
              <div style={{ flexShrink: 0 }}>
                <p style={{ margin: 0, fontSize: 10, color: '#888780' }}>Coût prév.</p>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 500 }}>{formatCurrency(a.jours_prev * a.tjm)}</p>
              </div>
              <button onClick={() => deleteAffectation(projetId, node.id, a.id)} style={{ ...iconBtnStyle, color: '#D85A30', flexShrink: 0 }}>
                <Trash2 size={13} />
              </button>
            </div>
            <div style={{ padding: '0 10px 8px', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
              <JoursRealisesParMois projetId={projetId} nodeId={node.id} affId={a.id}
                jours_realises_par_mois={a.jours_realises_par_mois || {}} jours_realises={a.jours_realises} />
            </div>
          </div>
        ))}
        {addingCollab && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
            <label style={{ ...labelStyle, flex: 1 }}>Collaborateur
              <select style={inputStyle} value={newCollabId} onChange={(e) => setNewCollabId(e.target.value)} autoFocus>
                <option value="">Choisir…</option>
                {disponibles.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
            </label>
            <button onClick={() => {
              if (!newCollabId) return;
              addAffectation(projetId, node.id, { collaborateur_id: newCollabId });
              setNewCollabId(''); setAddingCollab(false);
            }} style={btnPrimStyle}>OK</button>
            <button onClick={() => { setAddingCollab(false); setNewCollabId(''); }} style={btnSecStyle}>✕</button>
          </div>
        )}
        {affectees.length === 0 && !addingCollab && (
          <p style={{ fontSize: 12, color: '#888780', margin: 0 }}>Aucune affectation.</p>
        )}
      </div>

      {(budget.prev > 0 || budget.conso > 0) && (
        <div style={{ background: '#F8F8F7', borderRadius: 8, padding: '10px 14px', marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[
            { label: 'Budget prévu', value: formatCurrency(budget.prev), color: '#1A1A18' },
            { label: 'Consommé', value: formatCurrency(budget.conso), color: budget.conso > budget.prev ? '#D85A30' : '#1D9E75' },
            { label: 'Reste', value: formatCurrency(budget.reste), color: budget.reste < 0 ? '#D85A30' : '#5F5E5A' },
          ].map((item) => (
            <div key={item.label}>
              <p style={{ margin: 0, fontSize: 10, color: '#888780' }}>{item.label}</p>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: item.color }}>{item.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── WBS Row (sortable) ───────────────────────────────────────────
function WBSRow({ node, projetId, numeros, depth = 0, allNodes, onSelectNode, selectedIds, onToggleSelect, collapsedIds, onToggleExpand, visibleIds }) {
  if (visibleIds && !visibleIds.has(node.id)) return null;
  const expanded = !collapsedIds.has(node.id);
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const addWBSNode = useAppStore((s) => s.addWBSNode);
  const deleteWBSNode = useAppStore((s) => s.deleteWBSNode);
  const projet = useAppStore((s) => s.projets.find((p) => p.id === projetId));
  const { user, userDoc } = useAuth();
  const isCollab = userDoc?.role === 'collaborateur';
  const myCollab = collaborateurs.find((c) => c.user_id === user?.uid);
  const myCollabId = myCollab?.id || userDoc?.collaborateur_id;
  const isAssigned = isCollab && (node.affectations || []).some((a) => a.collaborateur_id === myCollabId);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });

  const children = allNodes.filter((n) => n.parent_id === node.id).sort((a, b) => a.ordre - b.ordre);
  const hasChildren = children.length > 0;
  const numero = numeros[node.id] || '';
  const budget = calculerBudgetNoeud(node, allNodes, projet?.tjm || []);
  const totalJours = node.affectations.reduce((s, a) => s + a.jours_prev, 0);
  const affCollab = (node.affectations || []).map((a) => collaborateurs.find((c) => c.id === a.collaborateur_id)).filter(Boolean);
  const isSelected = selectedIds.has(node.id);

  const trStyle = {
    borderBottom: '0.5px solid rgba(0,0,0,0.06)',
    cursor: 'pointer',
    background: isDragging ? '#F0F7FF' : isSelected ? '#EFF6FF' : '',
    opacity: isDragging ? 0.8 : 1,
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <>
      <tr
        ref={setNodeRef}
        style={{ ...trStyle, opacity: isCollab && !isAssigned ? 0.5 : 1 }}
        onClick={() => (!isCollab || isAssigned) && onSelectNode(node.id)}
        onMouseEnter={(e) => { if (!isSelected && !isDragging && (!isCollab || isAssigned)) e.currentTarget.style.background = '#F5F4F1'; }}
        onMouseLeave={(e) => { if (!isSelected && !isDragging) e.currentTarget.style.background = ''; }}
      >
        {/* Drag handle — admin seulement */}
        <td style={{ padding: '8px 4px 8px 8px', width: 24 }} onClick={(e) => e.stopPropagation()}>
          {!isCollab && (
            <div {...attributes} {...listeners} style={{ cursor: 'grab', color: '#DEDEDC', display: 'flex', alignItems: 'center' }}>
              <GripVertical size={14} />
            </div>
          )}
        </td>
        {/* Checkbox — admin seulement */}
        <td style={{ padding: '8px 8px', width: 32 }} onClick={(e) => e.stopPropagation()}>
          {!isCollab && (
            <input type="checkbox" checked={isSelected} onChange={() => onToggleSelect(node.id)}
              style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#378ADD' }} />
          )}
        </td>
        {/* # WBS */}
        <td style={{ padding: '8px 12px', width: 70, fontSize: 12, color: '#888780', fontFamily: 'monospace' }} onClick={(e) => e.stopPropagation()}>
          {numero}
        </td>
        {/* Nom */}
        <td style={{ padding: '8px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <button onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: '#888780', flexShrink: 0 }}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : <span style={{ width: 20, flexShrink: 0 }} />}
            <span style={{ fontSize: 13, fontWeight: depth === 0 ? 600 : 400 }}>{node.nom}</span>
          </div>
        </td>
        {/* Responsables */}
        <td style={{ padding: '8px 8px' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {affCollab.map((c) => <Avatar key={c.id} collaborateur={c} size={22} />)}
          </div>
        </td>
        {/* Dates */}
        <td style={{ padding: '8px 8px', fontSize: 12, color: '#5F5E5A', whiteSpace: 'nowrap' }}>
          {node.date_debut_prev && node.date_fin_prev
            ? `${fmtDate(node.date_debut_prev)} → ${fmtDate(node.date_fin_prev)}` : '—'}
        </td>
        {/* Avancement */}
        <td style={{ padding: '8px 8px', width: 110 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ flex: 1, height: 4, background: '#E8E7E3', borderRadius: 99 }}>
              <div style={{ height: '100%', width: `${node.avancement}%`, background: '#378ADD', borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 11, color: '#888780', flexShrink: 0 }}>{node.avancement}%</span>
          </div>
        </td>
        {/* Statut */}
        <td style={{ padding: '8px 8px' }}>
          <Badge label={STATUT_LABELS[node.statut] || node.statut} variant={node.statut} />
        </td>
        {/* Charge */}
        <td style={{ padding: '8px 12px', fontSize: 12, color: '#5F5E5A', textAlign: 'right' }}>
          {totalJours > 0 ? `${totalJours} j` : '—'}
        </td>
        {/* Budget */}
        <td style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', color: '#1A1A18' }}>
          {budget.prev > 0 ? formatCurrency(budget.prev) : '—'}
        </td>
        <td style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', color: budget.conso > budget.prev && budget.prev > 0 ? '#D85A30' : '#5F5E5A' }}>
          {budget.conso > 0 ? formatCurrency(budget.conso) : '—'}
        </td>
        {/* Actions — admin seulement */}
        <td style={{ padding: '8px 8px' }} onClick={(e) => e.stopPropagation()}>
          {!isCollab && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button title="Ajouter sous-tâche"
                onClick={() => addWBSNode(projetId, { parent_id: node.id, nom: 'Nouvelle sous-tâche', type: 'tache', niveau: node.niveau + 1, ordre: children.length + 1 })}
                style={miniBtn}>
                <Plus size={12} />
              </button>
              <button title="Supprimer"
                onClick={() => { if (confirm(`Supprimer "${node.nom}" ?`)) deleteWBSNode(projetId, node.id); }}
                style={{ ...miniBtn, color: '#D85A30' }}>
                <Trash2 size={12} />
              </button>
            </div>
          )}
        </td>
      </tr>

      {/* Enfants avec leur propre SortableContext */}
      {hasChildren && expanded && (
        <SortableContext items={children.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {children.map((child) => (
            <WBSRow key={child.id} node={child} projetId={projetId} numeros={numeros}
              depth={depth + 1} allNodes={allNodes} onSelectNode={onSelectNode}
              selectedIds={selectedIds} onToggleSelect={onToggleSelect}
              collapsedIds={collapsedIds} onToggleExpand={onToggleExpand}
              visibleIds={visibleIds} />
          ))}
        </SortableContext>
      )}
    </>
  );
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ── Détecte l'indentation ────────────────────────────────────────
function detectDepth(line) {
  let tabs = 0;
  for (const ch of line) { if (ch === '\t') tabs++; else break; }
  if (tabs > 0) return tabs;
  let spaces = 0;
  for (const ch of line) { if (ch === ' ') spaces++; else break; }
  return spaces >= 4 ? Math.floor(spaces / 4) : Math.floor(spaces / 2);
}

function parseImport(text, existingRacinesCount) {
  const lines = text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim() !== '');
  const nodes = [];
  const parentStack = [null];

  lines.forEach((line) => {
    const depth = detectDepth(line);
    const parts = line.trim().split('\t');
    const nom = parts[0].trim();
    if (!nom) return;

    const toISO = (d) => {
      if (!d) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
      return null;
    };

    const parent_id = depth === 0 ? null : (parentStack[depth] ?? parentStack[parentStack.length - 1] ?? null);
    const id = uuidv4();
    nodes.push({
      id, parent_id, nom,
      type: depth === 0 ? 'livrable' : 'tache',
      niveau: depth + 1,
      ordre: depth === 0
        ? existingRacinesCount + nodes.filter((n) => n.parent_id === null).length + 1
        : nodes.filter((n) => n.parent_id === parent_id).length + 1,
      date_debut_prev: toISO(parts[1]?.trim()),
      date_fin_prev: toISO(parts[2]?.trim()),
    });
    parentStack[depth + 1] = id;
    parentStack.splice(depth + 2);
  });
  return nodes;
}

// ── Modal import Excel ───────────────────────────────────────────
function ImportModal({ projetId, existingRacinesCount, onClose }) {
  const [text, setText] = useState('');
  const importWBSNodes = useAppStore((s) => s.importWBSNodes);
  const preview = text.trim() ? parseImport(text, existingRacinesCount) : [];

  const handleImport = async () => {
    if (preview.length === 0) return;
    await importWBSNodes(projetId, preview);
    onClose();
  };

  return (
    <div>
      <div style={{ background: '#F8F8F7', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#5F5E5A', lineHeight: 1.6 }}>
        <strong style={{ color: '#1A1A18' }}>Comment coller depuis Excel :</strong><br />
        • Sélectionnez vos cellules → Ctrl+C → collez ici (Ctrl+V)<br />
        • <strong>Colonnes :</strong> <code style={{ background: '#E8E7E3', padding: '1px 4px', borderRadius: 3 }}>Nom [Tab] Date début [Tab] Date fin</code><br />
        • <strong>Hiérarchie :</strong> indentez avec des tabulations (niveau 0 = livrable, niveau 1+ = tâche)
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 500, color: '#5F5E5A', marginBottom: 16 }}>
        Coller ici
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)}
          placeholder={"Analyse fonctionnelle\n\tRéunion de cadrage\n\tRédaction CDC\nDéveloppement\n\tModule A"}
          style={{ fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', minHeight: 160, resize: 'vertical', outline: 'none', lineHeight: 1.5 }} />
      </label>
      {preview.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#1A1A18' }}>
            Aperçu — {preview.length} tâche{preview.length > 1 ? 's' : ''} à créer
          </p>
          <div style={{ background: '#F8F8F7', borderRadius: 8, padding: '8px 12px', maxHeight: 220, overflowY: 'auto', fontSize: 12 }}>
            {preview.map((n, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', paddingLeft: (n.niveau - 1) * 20 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: n.type === 'livrable' ? '#378ADD' : '#888780' }} />
                <span style={{ fontWeight: n.type === 'livrable' ? 600 : 400 }}>{n.nom}</span>
                {n.date_debut_prev && <span style={{ color: '#888780' }}>{fmtDate(n.date_debut_prev)}{n.date_fin_prev ? ` → ${fmtDate(n.date_fin_prev)}` : ''}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnSecStyle}>Annuler</button>
        <button onClick={handleImport} disabled={preview.length === 0}
          style={{ ...btnPrimStyle, opacity: preview.length === 0 ? 0.4 : 1 }}>
          Importer {preview.length > 0 ? `(${preview.length})` : ''}
        </button>
      </div>
    </div>
  );
}

// ── Modal création manuelle ──────────────────────────────────────
function CreateTaskModal({ projetId, wbs, onClose }) {
  const addWBSNode = useAppStore((s) => s.addWBSNode);
  const [nom, setNom] = useState('');
  const [type, setType] = useState('livrable'); // 'livrable' | 'sous-tache'
  const [parentId, setParentId] = useState('');
  const [epingle, setEpingle] = useState(false);

  const livrables = wbs.filter((n) => n.parent_id === null).sort((a, b) => a.ordre - b.ordre);

  const handleCreate = async () => {
    if (!nom.trim()) return;
    if (type === 'livrable') {
      await addWBSNode(projetId, {
        parent_id: null, nom: nom.trim(), type: 'livrable', niveau: 1,
        ordre: livrables.length + 1, epingle_dashboard: epingle,
      });
    } else {
      if (!parentId) return;
      const parent = wbs.find((n) => n.id === parentId);
      const siblings = wbs.filter((n) => n.parent_id === parentId);
      await addWBSNode(projetId, {
        parent_id: parentId, nom: nom.trim(), type: 'tache',
        niveau: (parent?.niveau || 1) + 1, ordre: siblings.length + 1,
        epingle_dashboard: false,
      });
    }
    onClose();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={labelStyle}>Nom de la tâche *
        <input autoFocus style={inputStyle} value={nom} onChange={(e) => setNom(e.target.value)}
          placeholder="Ex : Analyse fonctionnelle" onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
      </label>

      <div>
        <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 500, color: '#5F5E5A' }}>Type</p>
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { value: 'livrable', label: '📁 Livrable', desc: 'Tâche de niveau 1' },
            { value: 'sous-tache', label: '📌 Sous-tâche', desc: 'Enfant d\'un livrable' },
          ].map((opt) => (
            <button key={opt.value} onClick={() => setType(opt.value)} style={{
              flex: 1, padding: '10px 14px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
              border: `2px solid ${type === opt.value ? '#378ADD' : 'rgba(0,0,0,0.12)'}`,
              background: type === opt.value ? '#EFF6FF' : '#fff',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1A1A18' }}>{opt.label}</div>
              <div style={{ fontSize: 11, color: '#888780', marginTop: 2 }}>{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {type === 'sous-tache' && (
        <label style={labelStyle}>Parent (livrable) *
          <select style={inputStyle} value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Choisir un livrable…</option>
            {livrables.map((n) => (
              <option key={n.id} value={n.id}>{n.nom}</option>
            ))}
          </select>
          {livrables.length === 0 && (
            <span style={{ fontSize: 11, color: '#D85A30' }}>Aucun livrable — créez d'abord un livrable.</span>
          )}
        </label>
      )}

      {type === 'livrable' && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${epingle ? '#378ADD' : 'rgba(0,0,0,0.12)'}`, background: epingle ? '#EFF6FF' : '#fff' }}>
          <input type="checkbox" checked={epingle} onChange={(e) => setEpingle(e.target.checked)} style={{ accentColor: '#378ADD', width: 14, height: 14 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#1A1A18' }}>📌 Afficher sur le dashboard</div>
            <div style={{ fontSize: 11, color: '#888780' }}>Apparaît dans "Prochains jalons" avec la date de fin prévue</div>
          </div>
        </label>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button onClick={onClose} style={btnSecStyle}>Annuler</button>
        <button onClick={handleCreate}
          disabled={!nom.trim() || (type === 'sous-tache' && !parentId)}
          style={{ ...btnPrimStyle, opacity: (!nom.trim() || (type === 'sous-tache' && !parentId)) ? 0.4 : 1 }}>
          Créer
        </button>
      </div>
    </div>
  );
}

// ── Page principale ──────────────────────────────────────────────
export default function ProjetWBS() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const deleteWBSNode = useAppStore((s) => s.deleteWBSNode);
  const deleteWBSNodesBulk = useAppStore((s) => s.deleteWBSNodesBulk);
  const reorderWBSChildren = useAppStore((s) => s.reorderWBSChildren);
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const { userDoc } = useAuth();
  const isCollab = userDoc?.role === 'collaborateur';

  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const [filterCollab, setFilterCollab] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterDelta, setFilterDelta] = useState('');

  const hasFilter = filterCollab || filterStatut || filterDelta;

  const visibleIds = useMemo(() => {
    if (!hasFilter) return null;
    const matchesLeaf = (node) => {
      if (projet.wbs.some((n) => n.parent_id === node.id)) return false;
      if (filterCollab && !(node.affectations || []).some((a) => a.collaborateur_id === filterCollab)) return false;
      if (filterStatut && node.statut !== filterStatut) return false;
      if (filterDelta) {
        const prev = (node.affectations || []).reduce((s, a) => s + (a.jours_prev || 0), 0);
        const reel = (node.affectations || []).reduce((s, a) => s + (a.jours_realises || 0), 0);
        const delta = prev - reel;
        if (filterDelta === 'avance' && delta <= 0) return false;
        if (filterDelta === 'depasse' && delta >= 0) return false;
      }
      return true;
    };
    const visible = new Set();
    const addWithParents = (nodeId) => {
      visible.add(nodeId);
      const node = projet.wbs.find((n) => n.id === nodeId);
      if (node?.parent_id) addWithParents(node.parent_id);
    };
    projet.wbs.forEach((node) => { if (matchesLeaf(node)) addWithParents(node.id); });
    return visible;
  }, [projet.wbs, filterCollab, filterStatut, filterDelta, hasFilter]);

  const parentIds = projet.wbs.filter((n) => projet.wbs.some((c) => c.parent_id === n.id)).map((n) => n.id);
  const allCollapsed = parentIds.length > 0 && parentIds.every((pid) => collapsedIds.has(pid));

  const toggleExpand = (nodeId) => setCollapsedIds((prev) => {
    const next = new Set(prev);
    next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
    return next;
  });
  const collapseAll = () => setCollapsedIds(new Set(parentIds));
  const expandAll = () => setCollapsedIds(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const numeros = calculerNumeroWBS(projet.wbs);
  const racines = projet.wbs.filter((n) => n.parent_id === null).sort((a, b) => a.ordre - b.ordre);
  const selectedNode = projet.wbs.find((n) => n.id === selectedNodeId);

  const allIds = projet.wbs.map((n) => n.id);
  const allSelected = allIds.length > 0 && allIds.every((nid) => selectedIds.has(nid));

  const toggleSelect = (nodeId) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
    return next;
  });

  const deleteSelected = async () => {
    if (!confirm(`Supprimer ${selectedIds.size} tâche(s) ?`)) return;
    // Filtre les racines (évite de supprimer un enfant dont le parent sera aussi supprimé)
    const rootIds = [...selectedIds].filter((nid) => {
      const node = projet.wbs.find((n) => n.id === nid);
      return node && !selectedIds.has(node.parent_id);
    });
    await deleteWBSNodesBulk(id, rootIds);
    setSelectedIds(new Set());
  };

  const handleDragEnd = ({ active, over }) => {
    if (!active || !over || active.id === over.id) return;
    const activeNode = projet.wbs.find((n) => n.id === active.id);
    const overNode = projet.wbs.find((n) => n.id === over.id);
    if (!activeNode || !overNode || activeNode.parent_id !== overNode.parent_id) return;

    const siblings = projet.wbs
      .filter((n) => n.parent_id === activeNode.parent_id)
      .sort((a, b) => a.ordre - b.ordre);

    const oldIdx = siblings.findIndex((n) => n.id === active.id);
    const newIdx = siblings.findIndex((n) => n.id === over.id);
    const reordered = arrayMove(siblings, oldIdx, newIdx);
    reorderWBSChildren(id, activeNode.parent_id, reordered.map((n) => n.id));
  };

  return (
    <div style={{ padding: 32 }}>
      <PageHeader
        title="WBS"
        subtitle={`${projet.wbs.length} tâche${projet.wbs.length > 1 ? 's' : ''}`}
        actions={!isCollab && (
          <>
            <button onClick={() => setShowImport(true)} style={btnSecStyle}>
              <ClipboardPaste size={14} style={{ marginRight: 6 }} /> Coller depuis Excel
            </button>
            <button onClick={() => setShowCreate(true)} style={btnPrimStyle}>
              <Plus size={14} style={{ marginRight: 4 }} /> Créer une tâche
            </button>
          </>
        )}
      />

      {/* Barre de filtres */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: '#888780', marginRight: 4 }}>Filtrer :</span>
        <select value={filterCollab} onChange={(e) => setFilterCollab(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: filterCollab ? '#EFF6FF' : '#fff', color: filterCollab ? '#378ADD' : '#5F5E5A', outline: 'none', cursor: 'pointer' }}>
          <option value="">Affecté à : Tous</option>
          {collaborateurs.filter((c) => c.actif).map((c) => (
            <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
          ))}
        </select>
        <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: filterStatut ? '#EFF6FF' : '#fff', color: filterStatut ? '#378ADD' : '#5F5E5A', outline: 'none', cursor: 'pointer' }}>
          <option value="">Statut : Tous</option>
          <option value="non_demarre">Non démarré</option>
          <option value="en_cours">En cours</option>
          <option value="termine">Terminé</option>
          <option value="bloque">Bloqué</option>
        </select>
        <select value={filterDelta} onChange={(e) => setFilterDelta(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: filterDelta ? '#EFF6FF' : '#fff', color: filterDelta ? '#378ADD' : '#5F5E5A', outline: 'none', cursor: 'pointer' }}>
          <option value="">Δ Prév−Réel : Tous</option>
          <option value="avance">En avance (Δ &gt; 0)</option>
          <option value="depasse">Dépassé (Δ &lt; 0)</option>
        </select>
        {hasFilter && (
          <button onClick={() => { setFilterCollab(''); setFilterStatut(''); setFilterDelta(''); }}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', cursor: 'pointer', color: '#5F5E5A' }}>
            ✕ Réinitialiser
          </button>
        )}
        {visibleIds && (
          <span style={{ fontSize: 11, color: '#888780' }}>
            {projet.wbs.filter((n) => visibleIds.has(n.id) && !projet.wbs.some((c) => c.parent_id === n.id)).length} tâche(s)
          </span>
        )}
      </div>

      {parentIds.length > 0 && (
        <div style={{ marginTop: -16, marginBottom: 16 }}>
          <button onClick={allCollapsed ? expandAll : collapseAll}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#888780', padding: 0 }}>
            {allCollapsed ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {allCollapsed ? 'Tout développer' : 'Tout réduire'}
          </button>
        </div>
      )}

      {!isCollab && selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
          <CheckSquare size={16} color="#378ADD" />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A18', flex: 1 }}>
            {selectedIds.size} tâche{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button onClick={() => setSelectedIds(new Set())} style={{ ...btnSecStyle, fontSize: 12, padding: '5px 10px' }}>Désélectionner</button>
          <button onClick={deleteSelected} style={{ ...btnPrimStyle, background: '#D85A30', fontSize: 12, padding: '5px 12px', gap: 6 }}>
            <Trash2 size={13} /> Supprimer
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
                <th style={{ width: 24, padding: '10px 4px 10px 8px' }} />
                <th style={{ padding: '10px 8px', width: 32 }}>
                  <input type="checkbox" checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(allIds))}
                    style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#378ADD' }} />
                </th>
                {['#', 'Nom', 'Resp.', 'Dates prév.', 'Avancement', 'Statut', 'Charge', 'Budget prév.', 'Budget conso.', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#888780', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <SortableContext items={racines.map((n) => n.id)} strategy={verticalListSortingStrategy}>
                {racines.map((node) => (
                  <WBSRow key={node.id} node={node} projetId={id} numeros={numeros}
                    depth={0} allNodes={projet.wbs} onSelectNode={setSelectedNodeId}
                    selectedIds={selectedIds} onToggleSelect={toggleSelect}
                    collapsedIds={collapsedIds} onToggleExpand={toggleExpand}
                    visibleIds={visibleIds} />
                ))}
              </SortableContext>
              {racines.length === 0 && (
                <tr>
                  <td colSpan={12} style={{ padding: 48, textAlign: 'center', color: '#888780' }}>
                    Aucune tâche. Cliquez sur "Créer une tâche" pour commencer.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DndContext>

      {showImport && (
        <Modal title="Importer des tâches depuis Excel" onClose={() => setShowImport(false)} width={580}>
          <ImportModal projetId={id} existingRacinesCount={racines.length} onClose={() => setShowImport(false)} />
        </Modal>
      )}

      {showCreate && (
        <Modal title="Créer une tâche" onClose={() => setShowCreate(false)} width={480}>
          <CreateTaskModal projetId={id} wbs={projet.wbs} onClose={() => setShowCreate(false)} />
        </Modal>
      )}

      {selectedNode && (
        <Modal title={`${numeros[selectedNode.id] || ''} ${selectedNode.nom}`} onClose={() => setSelectedNodeId(null)} width={580}>
          <DetailPanel projetId={id} nodeId={selectedNodeId} numeros={numeros} />
        </Modal>
      )}
    </div>
  );
}

const labelStyle = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, fontWeight: 500, color: '#5F5E5A' };
const inputStyle = { padding: '7px 9px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', background: '#fff' };
const btnPrimStyle = { display: 'inline-flex', alignItems: 'center', padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 13, cursor: 'pointer' };
const iconBtnStyle = { display: 'inline-flex', alignItems: 'center', padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.12)', background: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#5F5E5A', gap: 4 };
const miniBtn = { padding: 4, borderRadius: 4, border: '1px solid rgba(0,0,0,0.1)', background: '#fff', cursor: 'pointer', display: 'flex', color: '#5F5E5A' };

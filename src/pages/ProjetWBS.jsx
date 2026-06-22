import { useState } from 'react';
import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { calculerNumeroWBS, calculerBudgetNoeud, formatCurrency } from '../data/calculations';
import PageHeader from '../components/layout/PageHeader';
import Badge from '../components/ui/Badge';
import Avatar from '../components/ui/Avatar';
import Modal from '../components/ui/Modal';
import { Plus, ChevronRight, ChevronDown, Trash2, UserPlus, ClipboardPaste, CheckSquare, Calendar } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

// ── Saisie mensuelle des jours réalisés ──────────────────────────
function JoursRealisesParMois({ projetId, nodeId, affId, jours_realises_par_mois = {}, jours_realises }) {
  const setChargeRealiseMois = useAppStore((s) => s.setChargeRealiseMois);
  const [showAdd, setShowAdd] = useState(false);
  const [newMois, setNewMois] = useState('');

  const entries = Object.entries(jours_realises_par_mois).sort(([a], [b]) => a.localeCompare(b));
  const hasMonthly = entries.length > 0;

  const today = new Date();
  const defaultMois = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;

  return (
    <div style={{ marginTop: 6, paddingLeft: 0 }}>
      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: '#888780', fontWeight: 500 }}>
          J. réalisés : <strong style={{ color: '#1A1A18' }}>{jours_realises} j</strong>
          {hasMonthly && <span style={{ color: '#888780', fontWeight: 400 }}> (Σ mensuel)</span>}
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

      {/* Liste des mois */}
      {entries.map(([mois, jours]) => {
        const [year, month] = mois.split('-');
        const label = new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
        return (
          <div key={mois} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: '#5F5E5A', width: 72, flexShrink: 0 }}>{label}</span>
            <input
              type="number" min={0} step={0.5}
              defaultValue={jours}
              onBlur={(e) => setChargeRealiseMois(projetId, nodeId, affId, mois, parseFloat(e.target.value) || 0)}
              style={{ width: 52, padding: '3px 6px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)', fontSize: 11, outline: 'none' }}
            />
            <span style={{ fontSize: 11, color: '#888780' }}>j</span>
            <button
              onClick={() => setChargeRealiseMois(projetId, nodeId, affId, mois, 0)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#D85A30', padding: 2, display: 'flex' }}
            >
              <Trash2 size={10} />
            </button>
          </div>
        );
      })}

      {!hasMonthly && !showAdd && jours_realises > 0 && (
        <p style={{ fontSize: 10, color: '#888780', margin: '2px 0 0', fontStyle: 'italic' }}>
          Valeur héritée V1 — ajoutez des mois pour la facturation
        </p>
      )}

      {showAdd && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <input
            type="month"
            value={newMois}
            onChange={(e) => setNewMois(e.target.value)}
            style={{ padding: '3px 6px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)', fontSize: 11, outline: 'none' }}
          />
          <button
            onClick={() => {
              if (newMois && !jours_realises_par_mois[newMois]) {
                setChargeRealiseMois(projetId, nodeId, affId, newMois, 0);
              }
              setShowAdd(false);
            }}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 5, border: 'none', background: '#1A1A18', color: '#fff', cursor: 'pointer' }}
          >
            OK
          </button>
          <button onClick={() => setShowAdd(false)} style={{ fontSize: 11, padding: '3px 6px', borderRadius: 5, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', cursor: 'pointer' }}>
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

const STATUT_LABELS = { non_demarre: 'Non démarré', en_cours: 'En cours', termine: 'Terminé', bloque: 'Bloqué' };

// Panneau détail — lit le node FRAIS depuis le store à chaque rendu
function DetailPanel({ projetId, nodeId, numeros }) {
  const projet = useAppStore((s) => s.projets.find((p) => p.id === projetId));
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const updateWBSNode = useAppStore((s) => s.updateWBSNode);
  const addAffectation = useAppStore((s) => s.addAffectation);
  const updateAffectation = useAppStore((s) => s.updateAffectation);
  const deleteAffectation = useAppStore((s) => s.deleteAffectation);
  const setChargeRealiseMois = useAppStore((s) => s.setChargeRealiseMois);

  const [addingCollab, setAddingCollab] = useState(false);
  const [newCollabId, setNewCollabId] = useState('');

  // Toujours lire le node depuis le store (jamais stale)
  const node = projet?.wbs.find((n) => n.id === nodeId);
  if (!node) return null;

  const affectees = (node.affectations || []).map((a) => ({
    ...a,
    collab: collaborateurs.find((c) => c.id === a.collaborateur_id),
    tjm: projet.tjm.find((t) => t.collaborateur_id === a.collaborateur_id)?.montant || 0,
  }));

  const disponibles = collaborateurs.filter(
    (c) => c.actif && !node.affectations.find((a) => a.collaborateur_id === c.id)
  );

  const budget = calculerBudgetNoeud(node, projet.wbs, projet.tjm);
  const numero = numeros[node.id] || '';

  return (
    <div style={{ padding: 4 }}>
      {/* Infos de la tâche */}
      <label style={labelStyle}>
        Nom
        <input
          key={`nom-${node.id}-${node.nom}`}
          style={inputStyle}
          defaultValue={node.nom}
          onBlur={(e) => { if (e.target.value !== node.nom) updateWBSNode(projetId, node.id, { nom: e.target.value }); }}
        />
      </label>
      <label style={{ ...labelStyle, marginTop: 10 }}>
        Description
        <textarea
          key={`desc-${node.id}`}
          style={{ ...inputStyle, minHeight: 60, resize: 'vertical' }}
          defaultValue={node.description}
          onBlur={(e) => updateWBSNode(projetId, node.id, { description: e.target.value })}
        />
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <label style={labelStyle}>
          Début prévu
          <input type="date" style={inputStyle} value={node.date_debut_prev || ''}
            onChange={(e) => updateWBSNode(projetId, node.id, { date_debut_prev: e.target.value || null })} />
        </label>
        <label style={labelStyle}>
          Fin prévue
          <input type="date" style={inputStyle} value={node.date_fin_prev || ''}
            onChange={(e) => updateWBSNode(projetId, node.id, { date_fin_prev: e.target.value || null })} />
        </label>
        <label style={labelStyle}>
          Début réel
          <input type="date" style={inputStyle} value={node.date_debut_reel || ''}
            onChange={(e) => updateWBSNode(projetId, node.id, { date_debut_reel: e.target.value || null })} />
        </label>
        <label style={labelStyle}>
          Fin réelle
          <input type="date" style={inputStyle} value={node.date_fin_reel || ''}
            onChange={(e) => updateWBSNode(projetId, node.id, { date_fin_reel: e.target.value || null })} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
        <label style={labelStyle}>
          Statut
          <select style={inputStyle} value={node.statut}
            onChange={(e) => updateWBSNode(projetId, node.id, { statut: e.target.value })}>
            {Object.entries(STATUT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label style={labelStyle}>
          Avancement (%)
          <input type="number" min={0} max={100} style={inputStyle} value={node.avancement}
            onChange={(e) => updateWBSNode(projetId, node.id, { avancement: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) })} />
        </label>
      </div>

      <label style={{ ...labelStyle, marginTop: 10 }}>
        Kanban
        <select style={inputStyle} value={node.kanban_colonne}
          onChange={(e) => updateWBSNode(projetId, node.id, { kanban_colonne: e.target.value })}>
          <option value="backlog">Backlog</option>
          <option value="todo">À faire</option>
          <option value="en_cours">En cours</option>
          <option value="review">En révision</option>
          <option value="done">Terminé</option>
        </select>
      </label>

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
            {/* Saisie mensuelle des jours réalisés */}
            <div style={{ padding: '0 10px 8px', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
              <JoursRealisesParMois
                projetId={projetId}
                nodeId={node.id}
                affId={a.id}
                jours_realises_par_mois={a.jours_realises_par_mois || {}}
                jours_realises={a.jours_realises}
              />
            </div>
          </div>
        ))}

        {addingCollab && (
          <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'flex-end' }}>
            <label style={{ ...labelStyle, flex: 1 }}>
              Collaborateur
              <select style={inputStyle} value={newCollabId} onChange={(e) => setNewCollabId(e.target.value)} autoFocus>
                <option value="">Choisir…</option>
                {disponibles.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
              </select>
            </label>
            <button onClick={() => {
              if (!newCollabId) return;
              addAffectation(projetId, node.id, { collaborateur_id: newCollabId });
              setNewCollabId('');
              setAddingCollab(false);
            }} style={btnPrimStyle}>OK</button>
            <button onClick={() => { setAddingCollab(false); setNewCollabId(''); }} style={btnSecStyle}>✕</button>
          </div>
        )}

        {affectees.length === 0 && !addingCollab && (
          <p style={{ fontSize: 12, color: '#888780', margin: 0 }}>Aucune affectation.</p>
        )}
      </div>

      {/* Budget récap */}
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

function WBSRow({ node, projetId, numeros, depth = 0, allNodes, onSelectNode, selectedIds, onToggleSelect }) {
  const [expanded, setExpanded] = useState(true);
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const addWBSNode = useAppStore((s) => s.addWBSNode);
  const deleteWBSNode = useAppStore((s) => s.deleteWBSNode);

  const children = allNodes.filter((n) => n.parent_id === node.id).sort((a, b) => a.ordre - b.ordre);
  const hasChildren = children.length > 0;
  const numero = numeros[node.id] || '';

  const projet = useAppStore((s) => s.projets.find((p) => p.id === projetId));
  const budget = calculerBudgetNoeud(node, allNodes, projet?.tjm || []);
  const totalJours = node.affectations.reduce((s, a) => s + a.jours_prev, 0);
  const affCollab = (node.affectations || []).map((a) => collaborateurs.find((c) => c.id === a.collaborateur_id)).filter(Boolean);
  const isSelected = selectedIds.has(node.id);

  return (
    <>
      <tr
        onClick={() => onSelectNode(node.id)}
        style={{ borderBottom: '0.5px solid rgba(0,0,0,0.06)', cursor: 'pointer', transition: 'background 0.1s', background: isSelected ? '#EFF6FF' : '' }}
        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#F5F4F1'; }}
        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = ''; }}
      >
        {/* Checkbox */}
        <td style={{ padding: '8px 8px 8px 14px', width: 32 }} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggleSelect(node.id)}
            style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#378ADD' }}
          />
        </td>
        {/* # WBS */}
        <td style={{ padding: '8px 12px', width: 70, fontSize: 12, color: '#888780', fontFamily: 'monospace' }} onClick={(e) => e.stopPropagation()}>
          {numero}
        </td>
        {/* Nom */}
        <td style={{ padding: '8px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: depth * 20 }}>
            {hasChildren ? (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: '#888780', flexShrink: 0 }}
              >
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
        {/* Dates prév */}
        <td style={{ padding: '8px 8px', fontSize: 12, color: '#5F5E5A', whiteSpace: 'nowrap' }}>
          {node.date_debut_prev && node.date_fin_prev
            ? `${fmtDate(node.date_debut_prev)} → ${fmtDate(node.date_fin_prev)}`
            : '—'}
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
        {/* Budget prévu */}
        <td style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', color: '#1A1A18' }}>
          {budget.prev > 0 ? formatCurrency(budget.prev) : '—'}
        </td>
        {/* Budget conso */}
        <td style={{ padding: '8px 12px', fontSize: 12, textAlign: 'right', color: budget.conso > budget.prev && budget.prev > 0 ? '#D85A30' : '#5F5E5A' }}>
          {budget.conso > 0 ? formatCurrency(budget.conso) : '—'}
        </td>
        {/* Actions */}
        <td style={{ padding: '8px 8px' }} onClick={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              title="Ajouter sous-tâche"
              onClick={() => addWBSNode(projetId, {
                parent_id: node.id, nom: 'Nouvelle tâche', type: 'tache', niveau: node.niveau + 1, ordre: children.length + 1,
              })}
              style={miniBtn}
            >
              <Plus size={12} />
            </button>
            <button
              title="Supprimer"
              onClick={() => {
                if (confirm(`Supprimer "${node.nom}" et toutes ses sous-tâches ?`)) deleteWBSNode(projetId, node.id);
              }}
              style={{ ...miniBtn, color: '#D85A30' }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </td>
      </tr>
      {hasChildren && expanded && children.map((child) => (
        <WBSRow key={child.id} node={child} projetId={projetId} numeros={numeros} depth={depth + 1} allNodes={allNodes} onSelectNode={onSelectNode} selectedIds={selectedIds} onToggleSelect={onToggleSelect} />
      ))}
    </>
  );
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

// ── Détecte le niveau d'indentation d'une ligne ──────────────────
function detectDepth(line) {
  let tabs = 0;
  for (const ch of line) {
    if (ch === '\t') tabs++;
    else break;
  }
  if (tabs > 0) return tabs;
  // Espaces : groupes de 2 ou 4
  let spaces = 0;
  for (const ch of line) {
    if (ch === ' ') spaces++;
    else break;
  }
  return spaces >= 4 ? Math.floor(spaces / 4) : Math.floor(spaces / 2);
}

// ── Parse le texte collé et retourne une liste de nœuds à créer ──
function parseImport(text, existingRacinesCount) {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim() !== '');

  const nodes = [];
  // parentStack[depth] = id du dernier nœud créé à ce niveau
  const parentStack = [null]; // depth 0 → racine du projet

  lines.forEach((line, idx) => {
    const depth = detectDepth(line);
    // Extraire les colonnes (séparées par des tabs dans Excel)
    const parts = line.trim().split('\t');
    const nom = parts[0].trim();
    if (!nom) return;

    const dateDebut = parts[1]?.trim() || null;
    const dateFin   = parts[2]?.trim() || null;

    // Convertit une date Excel (dd/mm/yyyy ou yyyy-mm-dd) → ISO
    const toISO = (d) => {
      if (!d) return null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
      return null;
    };

    const parent_id = depth === 0 ? null : (parentStack[depth] ?? parentStack[parentStack.length - 1] ?? null);
    const id = uuidv4();

    nodes.push({
      id,
      parent_id,
      nom,
      type: depth === 0 ? 'livrable' : 'tache',
      niveau: depth + 1,
      ordre: depth === 0
        ? existingRacinesCount + nodes.filter(n => n.parent_id === null).length + 1
        : nodes.filter(n => n.parent_id === parent_id).length + 1,
      date_debut_prev: toISO(dateDebut),
      date_fin_prev:   toISO(dateFin),
      date_debut_reel: null,
      date_fin_reel:   null,
      avancement: 0,
      statut: 'non_demarre',
      kanban_colonne: 'backlog',
      affectations: [],
      description: '',
    });

    // Met à jour la pile
    parentStack[depth + 1] = id;
    // Vide les niveaux plus profonds devenus obsolètes
    parentStack.splice(depth + 2);
  });

  return nodes;
}

function ImportModal({ projetId, existingRacinesCount, onClose }) {
  const [text, setText] = useState('');
  const addWBSNode = useAppStore((s) => s.addWBSNode);

  const preview = text.trim() ? parseImport(text, existingRacinesCount) : [];

  const handleImport = () => {
    if (preview.length === 0) return;
    // On insère les nœuds dans l'ordre ; le store les ajoute un par un
    preview.forEach((node) => {
      addWBSNode(projetId, node);
    });
    onClose();
  };

  return (
    <div>
      {/* Instructions */}
      <div style={{ background: '#F8F8F7', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#5F5E5A', lineHeight: 1.6 }}>
        <strong style={{ color: '#1A1A18' }}>Comment coller depuis Excel :</strong><br />
        • Sélectionnez vos cellules dans Excel → Copier (Ctrl+C)<br />
        • Collez ici (Ctrl+V)<br />
        • <strong>Colonnes reconnues :</strong> <code style={{ background: '#E8E7E3', padding: '1px 4px', borderRadius: 3 }}>Nom [Tab] Date début [Tab] Date fin</code><br />
        • <strong>Hiérarchie :</strong> indentez avec des tabulations ou des espaces (ligne de niveau 0 = livrable, niveau 1+ = tâche)
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 500, color: '#5F5E5A', marginBottom: 16 }}>
        Coller ici
        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Analyse fonctionnelle\n\tRéunion de cadrage\n\tRédaction CDC\nDéveloppement\n\tModule A\n\tModule B"}
          style={{ fontFamily: 'monospace', fontSize: 12, padding: 10, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', minHeight: 160, resize: 'vertical', outline: 'none', lineHeight: 1.5 }}
        />
      </label>

      {/* Prévisualisation */}
      {preview.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 600, color: '#1A1A18' }}>
            Aperçu — {preview.length} tâche{preview.length > 1 ? 's' : ''} à créer
          </p>
          <div style={{ background: '#F8F8F7', borderRadius: 8, padding: '8px 12px', maxHeight: 220, overflowY: 'auto', fontSize: 12 }}>
            {preview.map((n, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', paddingLeft: (n.niveau - 1) * 20 }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: n.type === 'livrable' ? '#378ADD' : '#888780',
                }} />
                <span style={{ fontWeight: n.type === 'livrable' ? 600 : 400, color: '#1A1A18' }}>{n.nom}</span>
                {n.date_debut_prev && (
                  <span style={{ color: '#888780', marginLeft: 4 }}>
                    {fmtDate(n.date_debut_prev)}{n.date_fin_prev ? ` → ${fmtDate(n.date_fin_prev)}` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {text.trim() && preview.length === 0 && (
        <p style={{ fontSize: 12, color: '#D85A30', marginBottom: 12 }}>Aucune ligne valide détectée.</p>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={btnSecStyle}>Annuler</button>
        <button onClick={handleImport} disabled={preview.length === 0} style={{ ...btnPrimStyle, opacity: preview.length === 0 ? 0.4 : 1 }}>
          Importer {preview.length > 0 ? `(${preview.length})` : ''}
        </button>
      </div>
    </div>
  );
}

export default function ProjetWBS() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const addWBSNode = useAppStore((s) => s.addWBSNode);
  const deleteWBSNode = useAppStore((s) => s.deleteWBSNode);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const numeros = calculerNumeroWBS(projet.wbs);
  const racines = projet.wbs.filter((n) => n.parent_id === null).sort((a, b) => a.ordre - b.ordre);
  const selectedNode = projet.wbs.find((n) => n.id === selectedNodeId);

  const allIds = projet.wbs.map((n) => n.id);
  const allSelected = allIds.length > 0 && allIds.every((nid) => selectedIds.has(nid));
  const someSelected = selectedIds.size > 0;

  const toggleSelect = (nodeId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  };

  const deleteSelected = () => {
    const count = selectedIds.size;
    if (!confirm(`Supprimer ${count} tâche${count > 1 ? 's' : ''} sélectionnée${count > 1 ? 's' : ''} (et leurs sous-tâches) ?`)) return;
    // Delete top-level selection only — store handles descendants
    const toDelete = [...selectedIds].filter((nid) => {
      const node = projet.wbs.find((n) => n.id === nid);
      return node && !selectedIds.has(node.parent_id);
    });
    toDelete.forEach((nid) => deleteWBSNode(id, nid));
    setSelectedIds(new Set());
  };

  return (
    <div style={{ padding: 32 }}>
      <PageHeader
        title="WBS"
        subtitle={`${projet.wbs.length} tâche${projet.wbs.length > 1 ? 's' : ''}`}
        actions={
          <>
            <button onClick={() => setShowImport(true)} style={btnSecStyle}>
              <ClipboardPaste size={14} style={{ marginRight: 6 }} /> Coller depuis Excel
            </button>
            <button
              onClick={() => addWBSNode(id, { parent_id: null, nom: 'Nouveau livrable', type: 'livrable', niveau: 1, ordre: racines.length + 1 })}
              style={btnPrimStyle}
            >
              <Plus size={14} style={{ marginRight: 4 }} /> Ajouter livrable
            </button>
          </>
        }
      />

      {/* Barre de sélection groupée */}
      {someSelected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '10px 16px', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8 }}>
          <CheckSquare size={16} color="#378ADD" />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1A1A18', flex: 1 }}>
            {selectedIds.size} tâche{selectedIds.size > 1 ? 's' : ''} sélectionnée{selectedIds.size > 1 ? 's' : ''}
          </span>
          <button onClick={() => setSelectedIds(new Set())} style={{ ...btnSecStyle, fontSize: 12, padding: '5px 10px' }}>
            Désélectionner
          </button>
          <button onClick={deleteSelected} style={{ ...btnPrimStyle, background: '#D85A30', fontSize: 12, padding: '5px 12px', gap: 6 }}>
            <Trash2 size={13} /> Supprimer la sélection
          </button>
        </div>
      )}

      <div style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F8F8F7', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
              <th style={{ padding: '10px 8px 10px 14px', width: 32 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer', width: 14, height: 14, accentColor: '#378ADD' }}
                  title={allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                />
              </th>
              {['#', 'Nom', 'Resp.', 'Dates prév.', 'Avancement', 'Statut', 'Charge', 'Budget prév.', 'Budget conso.', ''].map((h) => (
                <th key={h} style={{ padding: '10px 8px', textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#888780', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {racines.map((node) => (
              <WBSRow
                key={node.id}
                node={node}
                projetId={id}
                numeros={numeros}
                depth={0}
                allNodes={projet.wbs}
                onSelectNode={setSelectedNodeId}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ))}
            {racines.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 48, textAlign: 'center', color: '#888780' }}>
                  Aucune tâche. Cliquez sur "Ajouter livrable" pour commencer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showImport && (
        <Modal title="Importer des tâches depuis Excel" onClose={() => setShowImport(false)} width={580}>
          <ImportModal projetId={id} existingRacinesCount={racines.length} onClose={() => setShowImport(false)} />
        </Modal>
      )}

      {selectedNode && (
        <Modal
          title={`${numeros[selectedNode.id] || ''} ${selectedNode.nom}`}
          onClose={() => setSelectedNodeId(null)}
          width={580}
        >
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

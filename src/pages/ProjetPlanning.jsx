import React, { useState, useMemo } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { calculerNumeroWBS, getLeaves, estCollaborateurExterne as estExterne } from '../data/calculations';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';

// ── Utilitaires date ──────────────────────────────────────────────
const JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MOIS_LABELS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

// toISOString() convertit en UTC : pour un Date construit à minuit local (fuseau UTC+, ex.
// France), ça retombe sur la veille. On formate donc à partir des composants locaux du Date.
function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}
function getDaysInRange(start, end) {
  const days = []; let cur = new Date(start);
  while (cur <= end) { days.push(new Date(cur)); cur = addDays(cur, 1); }
  return days;
}
function isWeekend(d) { const day = d.getDay(); return day === 0 || day === 6; }
// Arrondit à 2 décimales (évite les artefacts flottants type 48.681200000000004) et enlève les zéros inutiles.
function fmtJours(n) { return String(Math.round(n * 100) / 100).replace('.', ','); }
function groupByMonth(days) {
  const groups = [];
  days.forEach((d) => {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!groups.length || groups.at(-1).key !== key)
      groups.push({ key, label: `${MOIS_LABELS[d.getMonth()]} ${d.getFullYear()}`, days: [] });
    groups.at(-1).days.push(d);
  });
  return groups;
}

// ── Couleurs cellule réel ─────────────────────────────────────────
function reelBg(reel, prev, wknd) {
  if (wknd) return 'var(--color-bg-tertiary)';
  if (reel === 0) return 'var(--color-bg-card)';
  if (prev === 0) return 'var(--color-danger-soft)';
  if (reel > prev * 1.1) return 'var(--color-danger-soft)';
  if (reel >= prev * 0.9) return 'var(--color-warning-soft)';
  return 'var(--color-success-soft)';
}
function reelColor(reel, prev) {
  if (reel === 0) return 'var(--color-text-tertiary)';
  if (prev === 0 || reel > prev * 1.1) return 'var(--color-critical)';
  if (reel >= prev * 0.9) return 'var(--color-warning)';
  return 'var(--color-success)';
}

// ── Δ helpers ─────────────────────────────────────────────────────
function DeltaCell({ delta, bg }) {
  if (delta === null || delta === undefined) return <td style={deltaCellStyle(bg)} />;
  const isNeg = delta < 0;
  const isZero = delta === 0;
  return (
    <td style={deltaCellStyle(bg)}>
      <span style={{ fontSize: 11, fontWeight: 600, color: isZero ? 'var(--color-text-tertiary)' : isNeg ? 'var(--color-critical)' : 'var(--color-success)' }}>
        {isNeg ? '' : '+'}{delta % 1 === 0 ? delta : delta.toFixed(1)}
      </span>
    </td>
  );
}
const deltaCellStyle = (bg) => ({
  position: 'sticky', left: COL_LEFT.delta, zIndex: 2,
  width: 46, minWidth: 46, textAlign: 'center',
  borderRight: '1px solid var(--color-border)',
  borderBottom: '0.5px solid var(--color-border-soft)',
  background: bg || 'var(--color-bg-card)', verticalAlign: 'middle',
});

// ── Cellule charge éditable ───────────────────────────────────────
function navigateCell(currentTd, direction) {
  const table = currentTd.closest('table');
  if (!table) return;
  const rows = [...table.querySelectorAll('tbody tr')];
  const cells = [...currentTd.parentElement.querySelectorAll('td[data-charge]')];
  const colIdx = cells.indexOf(currentTd);
  const rowIdx = rows.indexOf(currentTd.parentElement);

  let targetTd = null;
  if (direction === 'left' && colIdx > 0) targetTd = cells[colIdx - 1];
  else if (direction === 'right' && colIdx < cells.length - 1) targetTd = cells[colIdx + 1];
  else if (direction === 'up' || direction === 'down') {
    const step = direction === 'up' ? -1 : 1;
    let r = rowIdx + step;
    while (r >= 0 && r < rows.length) {
      const candidateCells = [...rows[r].querySelectorAll('td[data-charge]')];
      if (candidateCells[colIdx]) { targetTd = candidateCells[colIdx]; break; }
      r += step;
    }
  }
  if (targetTd) targetTd.focus();
}

function ChargeCell({ value, onChange, bg, color, colWidth, conflict }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const tdRef = React.useRef(null);

  const startEdit = () => { setDraft(value > 0 ? String(value).replace('.', ',') : ''); setEditing(true); };
  const commit = (dir) => {
    onChange(Math.min(1, Math.max(0, parseFloat(draft.replace(',', '.')) || 0)));
    setEditing(false);
    // Après commit, on navigue si direction précisée
    if (dir && tdRef.current) setTimeout(() => navigateCell(tdRef.current, dir), 0);
  };

  const conflictStyle = conflict ? {
    outline: '1.5px solid var(--color-warning)', outlineOffset: '-1.5px',
    background: value > 0 ? bg : 'var(--color-warning-soft)',
  } : {};

  return (
    <td
      ref={tdRef}
      data-charge="1"
      tabIndex={0}
      onClick={startEdit}
      onKeyDown={(e) => {
        if (!editing) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startEdit(); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); navigateCell(tdRef.current, 'right'); }
          else if (e.key === 'ArrowLeft')  { e.preventDefault(); navigateCell(tdRef.current, 'left'); }
          else if (e.key === 'ArrowUp')    { e.preventDefault(); navigateCell(tdRef.current, 'up'); }
          else if (e.key === 'ArrowDown')  { e.preventDefault(); navigateCell(tdRef.current, 'down'); }
          else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onChange(0); }
          else if (/^[0-9,.]$/.test(e.key)) { setDraft(e.key); setEditing(true); }
        }
      }}
      title={conflict ? `⚠️ ${conflict} déjà planifié(e) ce jour sur une autre tâche` : undefined}
      style={{
        width: colWidth, minWidth: colWidth, maxWidth: colWidth,
        height: 26, padding: 0,
        border: '0.5px solid var(--color-border-soft)',
        background: bg, cursor: 'pointer', textAlign: 'center', verticalAlign: 'middle',
        position: 'relative', outline: 'none',
        ...conflictStyle,
      }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = 'inset 0 0 0 2px var(--color-info)'; }}
      onBlur={(e) => { if (!editing) e.currentTarget.style.boxShadow = 'none'; }}
    >
      {conflict && !editing && (
        <span style={{
          position: 'absolute', top: 0, right: 0,
          width: 5, height: 5, borderRadius: '0 0 0 5px',
          background: 'var(--color-warning)', zIndex: 1,
        }} />
      )}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter')  { e.preventDefault(); commit('down'); }
            if (e.key === 'Tab')    { e.preventDefault(); commit(e.shiftKey ? 'left' : 'right'); }
            if (e.key === 'ArrowRight' && draft === '') { commit('right'); }
            if (e.key === 'ArrowLeft'  && draft === '') { commit('left'); }
            if (e.key === 'ArrowDown')  { e.preventDefault(); commit('down'); }
            if (e.key === 'ArrowUp')    { e.preventDefault(); commit('up'); }
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            width: '100%', height: '100%', border: '2px solid var(--color-info)',
            textAlign: 'center', fontSize: 11, outline: 'none',
            background: 'var(--color-bg-card)', fontFamily: 'inherit', padding: 0,
          }}
        />
      ) : (
        <span style={{ fontSize: 11, color: value > 0 ? color : 'var(--color-text-tertiary)', fontWeight: value > 0 ? 600 : 400 }}>
          {value > 0 ? String(value % 1 === 0 ? value : value.toFixed(1)).replace('.', ',') : '·'}
        </span>
      )}
    </td>
  );
}

const STATUT_OPTIONS = [
  { value: 'non_demarre', label: 'Non démarré', color: 'var(--color-text-tertiary)' },
  { value: 'en_cours',    label: 'En cours',    color: 'var(--color-info)' },
  { value: 'termine',     label: 'Terminé',     color: 'var(--color-success)' },
  { value: 'bloque',      label: 'Bloqué',      color: 'var(--color-danger)' },
];

// ── Lignes d'une tâche ────────────────────────────────────────────
function TaskRows({ node, projetId, depth, allNodes, days, colWidth, numeros, collaborateurs, showPrev, showReel, chargeParCollabJour, congesParCollab, visibleIds, collapsedIds, onToggleExpand }) {
  if (visibleIds && !visibleIds.has(node.id)) return null;
  const expanded = !collapsedIds.has(node.id);
  const [filling, setFilling] = useState(null); // affId en cours de remplissage
  const [fillVal, setFillVal] = useState('1');
  const setChargePlanning = useAppStore((s) => s.setChargePlanning);
  const setChargePlanningReel = useAppStore((s) => s.setChargePlanningReel);
  const updateWBSNode = useAppStore((s) => s.updateWBSNode);
  const addAffectation = useAppStore((s) => s.addAffectation);
  const updateAffectation = useAppStore((s) => s.updateAffectation);
  const deleteAffectation = useAppStore((s) => s.deleteAffectation);

  const handleCollabChange = (newCollabId) => {
    const affs = node.affectations || [];
    if (!newCollabId) {
      // Supprimer toutes les affectations existantes
      affs.forEach((a) => deleteAffectation(projetId, node.id, a.id));
      return;
    }
    if (affs.length === 0) {
      addAffectation(projetId, node.id, { collaborateur_id: newCollabId, jours_prev: 0, jours_realises: 0 });
    } else if (affs.length === 1) {
      updateAffectation(projetId, node.id, affs[0].id, { collaborateur_id: newCollabId });
    } else {
      // Plusieurs affectations : on garde la première et on supprime les autres
      updateAffectation(projetId, node.id, affs[0].id, { collaborateur_id: newCollabId });
      affs.slice(1).forEach((a) => deleteAffectation(projetId, node.id, a.id));
    }
  };

  const doFill = (affId, collabId, val) => {
    const v = Math.min(1, Math.max(0, parseFloat(String(val).replace(',', '.')) || 0));
    days.forEach((d) => {
      const iso = toISO(d);
      if (isWeekend(d)) return;
      if ((congesParCollab[collabId] || {})[iso]) return;
      setChargePlanning(projetId, node.id, affId, iso, v);
    });
    setFilling(null);
  };

  const children = allNodes.filter((n) => n.parent_id === node.id).sort((a, b) => a.ordre - b.ordre);
  const hasChildren = children.length > 0;
  const isLeaf = !hasChildren;
  const numero = numeros[node.id] || '';

  // Remonte les affectations de toutes les sous-tâches (feuilles) pour les livrables/parents —
  // un livrable n'a lui-même quasiment jamais d'affectation directe.
  const leafAffectations = useMemo(
    () => getLeaves(node, allNodes).flatMap((l) => l.affectations || []),
    [node, allNodes]
  );

  const totalJoursPrev = leafAffectations.reduce((s, a) => s + (a.jours_prev || 0), 0);
  const totalJoursReel = leafAffectations.reduce((s, a) => s + (a.jours_realises || 0), 0);
  // Le delta est affiché dès qu'on a de la donnée, indépendamment de la vue (Prév/Réel/Les deux)
  // sélectionnée — avant ça n'apparaissait que sur "Les deux".
  const delta = (totalJoursPrev > 0 || totalJoursReel > 0) ? totalJoursPrev - totalJoursReel : null;

  const totalPrevByDay = {};
  const totalReelByDay = {};
  days.forEach((d) => {
    const iso = toISO(d);
    totalPrevByDay[iso] = leafAffectations.reduce((s, a) => s + ((a.planning || {})[iso] || 0), 0);
    totalReelByDay[iso] = leafAffectations.reduce((s, a) => s + ((a.planning_reel || {})[iso] || 0), 0);
  });

  const headerBg = depth === 0 ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)';

  return (
    <>
      {/* Ligne titre tâche */}
      <tr style={{ background: headerBg }}>
        <td style={{ ...frozenLeft(depth), background: headerBg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasChildren ? (
              <button onClick={() => onToggleExpand(node.id)} style={chevronBtn}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRightIcon size={12} />}
              </button>
            ) : <span style={{ width: 16, flexShrink: 0 }} />}
            <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'monospace', marginRight: 4, flexShrink: 0 }}>{numero}</span>
            <span style={{ fontSize: 12, fontWeight: depth === 0 ? 700 : 500 }}>
              {node.nom}
            </span>
          </div>
        </td>
        {/* Colonne Collab (picklist) */}
        <td style={{ ...collabCol, background: headerBg }}>
          {isLeaf && (
            <select
              value={(node.affectations || [])[0]?.collaborateur_id || ''}
              onChange={(e) => handleCollabChange(e.target.value)}
              style={collabSelectStyle}
            >
              <option value="">— Aucun —</option>
              {collaborateurs.filter((c) => c.actif).map((c) => (
                <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
              ))}
              {collaborateurs.filter((c) => !c.actif && (node.affectations || []).some((a) => a.collaborateur_id === c.id)).map((c) => (
                <option key={c.id} value={c.id} style={{ color: 'var(--color-text-tertiary)' }}>{c.prenom} {c.nom} (inactif)</option>
              ))}
            </select>
          )}
        </td>
        {/* Colonne Statut */}
        <td style={{ ...statutCol, background: headerBg }}>
          {(() => {
            const s = STATUT_OPTIONS.find((o) => o.value === node.statut) || STATUT_OPTIONS[0];
            return (
              <select
                value={node.statut || 'non_demarre'}
                onChange={(e) => updateWBSNode(projetId, node.id, { statut: e.target.value })}
                style={{ ...statutSelectStyle, color: s.color, borderColor: s.color + '55' }}
              >
                {STATUT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            );
          })()}
        </td>
        {/* Total */}
        <td style={{ ...totalCol, background: headerBg }}>
          {showPrev && <div style={{ fontSize: 10, color: 'var(--color-info)', fontWeight: 600 }}>{totalJoursPrev > 0 ? `${fmtJours(totalJoursPrev)}j` : ''}</div>}
          {showReel && totalJoursReel > 0 && (
            <div style={{ fontSize: 10, color: totalJoursReel > totalJoursPrev ? 'var(--color-critical)' : 'var(--color-success)', fontWeight: 600 }}>{fmtJours(totalJoursReel)}j</div>
          )}
        </td>
        {/* Δ */}
        <DeltaCell delta={delta} bg={headerBg} />
        {/* Jours */}
        {days.map((d) => {
          const iso = toISO(d);
          const prev = totalPrevByDay[iso];
          const reel = totalReelByDay[iso];
          const wknd = isWeekend(d);
          return (
            <td key={iso} style={{
              width: colWidth, minWidth: colWidth,
              border: '0.5px solid var(--color-border-soft)',
              background: wknd ? 'var(--color-bg-tertiary)' : headerBg,
              textAlign: 'center', fontSize: 10, height: 26,
              borderLeft: d.getDay() === 1 ? '1px solid var(--color-border)' : undefined,
            }}>
              {showPrev && prev > 0 && <div style={{ color: 'var(--color-info)', fontWeight: 600, lineHeight: 1.2 }}>{String(prev % 1 === 0 ? prev : prev.toFixed(1)).replace('.', ',')}</div>}
              {showReel && reel > 0 && <div style={{ color: reelColor(reel, prev), fontWeight: 600, lineHeight: 1.2 }}>{String(reel % 1 === 0 ? reel : reel.toFixed(1)).replace('.', ',')}</div>}
            </td>
          );
        })}
      </tr>

      {/* Lignes collaborateur */}
      {isLeaf && expanded && (showPrev || showReel) && (node.affectations || []).map((aff) => {
        const collab = collaborateurs.find((c) => c.id === aff.collaborateur_id);
        if (!collab) return null;
        const joursPrev = aff.jours_prev || 0;
        const joursReel = aff.jours_realises || 0;
        const affDelta = (joursPrev > 0 || joursReel > 0) ? joursPrev - joursReel : null;

        return (
          <React.Fragment key={aff.id}>
            {showPrev && (
              <tr style={{ background: 'var(--color-bg-secondary)' }}>
                <td style={{ ...frozenLeft(depth + 1), background: 'var(--color-bg-secondary)' }}>
                  {filling === aff.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 16 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: collab.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#FFFFFF', flexShrink: 0 }}>
                        {collab.initiales}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', flexShrink: 0 }}>Remplir :</span>
                      <input
                        autoFocus
                        value={fillVal}
                        onChange={(e) => setFillVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') doFill(aff.id, aff.collaborateur_id, fillVal); if (e.key === 'Escape') setFilling(null); }}
                        style={{ width: 36, padding: '1px 4px', border: '1.5px solid var(--color-info)', borderRadius: 4, fontSize: 11, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }}
                      />
                      <button onClick={() => doFill(aff.id, aff.collaborateur_id, fillVal)} style={{ padding: '1px 6px', borderRadius: 4, border: 'none', background: 'var(--color-info)', color: '#FFFFFF', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>OK</button>
                      <button onClick={() => setFilling(null)} style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', fontSize: 11, cursor: 'pointer', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 16, flexShrink: 0 }} />
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: collab.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#FFFFFF', flexShrink: 0 }}>
                        {collab.initiales}
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', }}>{collab.prenom} {collab.nom}</span>
                      {estExterne(collab) && (
                        <span style={{ fontSize: 9, background: 'var(--color-warning-soft)', color: 'var(--color-warning)', borderRadius: 4, padding: '1px 4px', flexShrink: 0, fontWeight: 600 }} title="Collaborateur externe (co-traitance / client)">EXT</span>
                      )}
                      <span style={{ fontSize: 9, background: 'var(--color-info-soft)', color: 'var(--color-info)', borderRadius: 4, padding: '1px 4px', flexShrink: 0, fontWeight: 600 }}>PRÉ</span>
                      <button
                        onClick={() => { setFilling(aff.id); setFillVal('1'); }}
                        title="Remplir tous les jours visibles"
                        style={{ marginLeft: 'auto', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'var(--color-info-soft)', color: 'var(--color-info)', fontSize: 10, cursor: 'pointer', flexShrink: 0 }}
                      >↔</button>
                    </div>
                  )}
                </td>
                <td style={{ ...collabCol, background: 'var(--color-bg-secondary)' }} />
                <td style={{ ...statutCol, background: 'var(--color-bg-secondary)' }} />
                <td style={{ ...totalCol, background: 'var(--color-bg-secondary)', color: 'var(--color-info)', fontSize: 11, fontWeight: 600 }}>
                  {joursPrev > 0 ? `${fmtJours(joursPrev)}j` : ''}
                </td>
                {/* Δ sur ligne prév — visible quelle que soit la vue sélectionnée */}
                <DeltaCell delta={affDelta} bg='var(--color-bg-secondary)' />
                {days.map((d) => {
                  const iso = toISO(d);
                  const value = (aff.planning || {})[iso] || 0;
                  const wknd = isWeekend(d);
                  const isConge = (congesParCollab[aff.collaborateur_id]?.[iso] || 0) > 0;
                  // Conflit : charge totale ce jour pour ce collab (toutes tâches) - valeur actuelle > 0
                  const totalJourCollab = (chargeParCollabJour[aff.collaborateur_id] || {})[iso] || 0;
                  const autresTaches = totalJourCollab - value;
                  const conflict = !isConge && autresTaches > 0 ? collab.prenom : null;
                  const bg = isConge ? 'var(--color-danger-soft)' : wknd ? 'var(--color-bg-tertiary)' : value >= 1 ? 'var(--color-info-soft)' : value > 0 ? 'var(--color-info-soft)' : 'var(--color-bg-secondary)';
                  return isConge ? (
                    <td key={iso} title={`Congé — ${collab.prenom} ${collab.nom}`} style={{
                      width: colWidth, minWidth: colWidth, height: 26, border: '0.5px solid var(--color-border-soft)',
                      background: 'var(--color-danger-soft)', textAlign: 'center', verticalAlign: 'middle', cursor: 'not-allowed',
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--color-danger)' }}>✕</span>
                    </td>
                  ) : (
                    <ChargeCell key={iso} value={value} isWeekend={wknd} colWidth={colWidth} bg={bg} color='var(--color-info)' conflict={conflict}
                      onChange={(v) => setChargePlanning(projetId, node.id, aff.id, iso, v)} />
                  );
                })}
              </tr>
            )}
            {showReel && (
              <tr style={{ background: 'var(--color-bg-secondary)' }}>
                <td style={{ ...frozenLeft(depth + 1), background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 16, flexShrink: 0 }} />
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: collab.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#FFFFFF', flexShrink: 0, opacity: 0.6 }}>
                      {collab.initiales}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', }}>{collab.prenom} {collab.nom}</span>
                    {estExterne(collab) && (
                      <span style={{ fontSize: 9, background: 'var(--color-warning-soft)', color: 'var(--color-warning)', borderRadius: 4, padding: '1px 4px', flexShrink: 0, fontWeight: 600 }} title="Collaborateur externe (co-traitance / client)">EXT</span>
                    )}
                    <span style={{ fontSize: 9, background: 'var(--color-warning-soft)', color: 'var(--color-warning)', borderRadius: 4, padding: '1px 4px', flexShrink: 0, fontWeight: 600 }}>RÉE</span>
                  </div>
                </td>
                <td style={{ ...collabCol, background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-soft)' }} />
                <td style={{ ...statutCol, background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-soft)' }} />
                <td style={{ ...totalCol, background: 'var(--color-bg-secondary)', fontSize: 11, fontWeight: 600, borderBottom: '1px solid var(--color-border-soft)', color: joursReel > joursPrev ? 'var(--color-critical)' : joursReel > 0 ? 'var(--color-success)' : 'var(--color-text-tertiary)' }}>
                  {joursReel > 0 ? `${fmtJours(joursReel)}j` : ''}
                </td>
                {/* Δ sur ligne réel — visible quelle que soit la vue sélectionnée */}
                <DeltaCell delta={affDelta} bg='var(--color-bg-secondary)' />
                {days.map((d) => {
                  const iso = toISO(d);
                  const reel = (aff.planning_reel || {})[iso] || 0;
                  const prev = (aff.planning || {})[iso] || 0;
                  const wknd = isWeekend(d);
                  const isConge = (congesParCollab[aff.collaborateur_id]?.[iso] || 0) > 0;
                  const bg = wknd ? 'var(--color-bg-tertiary)' : reelBg(reel, prev, false);
                  // Même marquage congé que sur la ligne Prév — avant, seule la ligne Prév le montrait.
                  return isConge ? (
                    <td key={iso} title={`Congé — ${collab.prenom} ${collab.nom}`} style={{
                      width: colWidth, minWidth: colWidth, height: 26, border: '0.5px solid var(--color-border-soft)',
                      background: 'var(--color-danger-soft)', textAlign: 'center', verticalAlign: 'middle', cursor: 'not-allowed',
                    }}>
                      <span style={{ fontSize: 10, color: 'var(--color-danger)' }}>✕</span>
                    </td>
                  ) : (
                    <ChargeCell key={iso} value={reel} isWeekend={wknd} colWidth={colWidth} bg={bg}
                      color={reelColor(reel, prev)}
                      onChange={(v) => setChargePlanningReel(projetId, node.id, aff.id, iso, v)} />
                  );
                })}
              </tr>
            )}
          </React.Fragment>
        );
      })}

      {/* Enfants */}
      {hasChildren && expanded && children.map((child) => (
        <TaskRows key={child.id} node={child} projetId={projetId} depth={depth + 1}
          allNodes={allNodes} days={days} colWidth={colWidth} numeros={numeros}
          collaborateurs={collaborateurs} showPrev={showPrev} showReel={showReel}
          chargeParCollabJour={chargeParCollabJour} congesParCollab={congesParCollab}
          visibleIds={visibleIds} collapsedIds={collapsedIds} onToggleExpand={onToggleExpand} />
      ))}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────
// Colonnes figées : Tâche / Collab / Statut / Total / Δ (Prév−Réel) — les jours défilent seuls.
// Le premier essai (session précédente) causait un décalage visuel : la table utilisait
// `border-collapse: collapse`, qui doit décider laquelle de deux cellules voisines "possède" la
// bordure partagée au pixel près — logique qui casse quand une des deux cellules est
// `position: sticky` (peinte dans une couche de composition à part). Le tableau passe donc en
// `border-collapse: separate` (voir `<table>` plus bas) : chaque cellule garde sa propre bordure,
// plus de fusion ambiguë. Chaque colonne figée précise son offset `left` cumulé (largeurs
// 340 / 130 / 100 / 48 / 46) et un `background` explicite (sinon le contenu défilant transparaît).
const COL_LEFT = { tache: 0, collab: 340, statut: 470, total: 570, delta: 618 };
const frozenLeft = (depth) => ({
  position: 'sticky', left: COL_LEFT.tache, zIndex: 2, background: 'inherit',
  width: 340, minWidth: 340,
  padding: `4px 8px 4px ${8 + depth * 14}px`,
  fontSize: 12, borderRight: '1px solid var(--color-border)',
  whiteSpace: 'normal', wordBreak: 'break-word',
  borderBottom: '0.5px solid var(--color-border-soft)',
});
const totalCol = {
  position: 'sticky', left: COL_LEFT.total, zIndex: 2,
  width: 48, minWidth: 48, textAlign: 'right', paddingRight: 8,
  fontSize: 11, fontWeight: 600,
  borderRight: '1px solid var(--color-border)',
  borderBottom: '0.5px solid var(--color-border-soft)', verticalAlign: 'middle',
};
const chevronBtn = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--color-text-tertiary)', flexShrink: 0 };

// ── Page ─────────────────────────────────────────────────────────
const ZOOM_OPTIONS = [
  { key: '4w',  label: '4 sem.',   days: 28 },
  { key: '1m',  label: '1 mois',  days: 31 },
  { key: '2m',  label: '2 mois',  days: 62 },
  { key: '3m',  label: '3 mois',  days: 92 },
  { key: '6m',  label: '6 mois',  days: 184 },
  { key: '12m', label: '12 mois', days: 365 },
];
const COL_WIDTH = 34;
const today = toISO(new Date());

export default function ProjetPlanning() {
  const { id } = useParams();
  const { headerHeight } = useOutletContext();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const collaborateurs = useAppStore((s) => s.collaborateurs);

  // Par défaut : vue "1 mois" démarrant le 1er du mois en cours (plutôt qu'une plage de 2 mois
  // ancrée sur la semaine courante).
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [zoom, setZoom] = useState('1m');
  const [vue, setVue] = useState('les deux');
  const [filterCollab, setFilterCollab] = useState('');
  const [filterStatut, setFilterStatut] = useState('');
  const [filterDelta, setFilterDelta] = useState('');
  // Toutes les tâches ayant des sous-tâches démarrent pliées à l'ouverture du projet —
  // même logique/état que sur WBS, avec un bouton "tout plier / tout déplier".
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(
    projet.wbs.filter((n) => projet.wbs.some((c) => c.parent_id === n.id)).map((n) => n.id)
  ));

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

  const showPrev = vue === 'prévisionnel' || vue === 'les deux';
  const showReel = vue === 'réel' || vue === 'les deux';

  // Pour "1 mois", on calcule le nombre exact de jours du mois affiché plutôt qu'une constante
  // (28-31j selon le mois) pour que la plage colle pile au mois, du 1er au dernier jour.
  const nbDays = zoom === '1m'
    ? new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0).getDate()
    : ZOOM_OPTIONS.find((z) => z.key === zoom)?.days || 62;
  const endDate = addDays(startDate, nbDays - 1);
  const days = getDaysInRange(startDate, endDate);
  const monthGroups = groupByMonth(days);

  const numeros = calculerNumeroWBS(projet.wbs);
  const racines = projet.wbs.filter((n) => n.parent_id === null).sort((a, b) => a.ordre - b.ordre);

  const parentIds = projet.wbs.filter((n) => projet.wbs.some((c) => c.parent_id === n.id)).map((n) => n.id);
  const allCollapsed = parentIds.length > 0 && parentIds.every((pid) => collapsedIds.has(pid));
  const toggleExpand = (nodeId) => setCollapsedIds((prev) => {
    const next = new Set(prev);
    next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
    return next;
  });
  const collapseAll = () => setCollapsedIds(new Set(parentIds));
  const expandAll = () => setCollapsedIds(new Set());

  // ── Calcul charge totale par collaborateur par jour (toutes tâches) ──
  const chargeParCollabJour = useMemo(() => {
    const map = {};
    projet.wbs.forEach((node) => {
      (node.affectations || []).forEach((aff) => {
        if (!map[aff.collaborateur_id]) map[aff.collaborateur_id] = {};
        Object.entries(aff.planning || {}).forEach(([date, v]) => {
          map[aff.collaborateur_id][date] = (map[aff.collaborateur_id][date] || 0) + v;
        });
      });
    });
    return map;
  }, [projet.wbs]);

  // ── Jours de congés par collaborateur ────────────────────────────
  const congesParCollab = useMemo(() => {
    const map = {};
    collaborateurs.forEach((c) => {
      if (c.conges && Object.keys(c.conges).length > 0) map[c.id] = c.conges;
    });
    return map;
  }, [collaborateurs]);

  // En vue "1 mois", naviguer saute d'un mois calendaire pile (1er → 1er) plutôt que d'un
  // nombre de jours approximatif, pour rester aligné sur le 1er du mois.
  const nav = (dir) => setStartDate((prev) => (
    zoom === '1m'
      ? new Date(prev.getFullYear(), prev.getMonth() + dir, 1)
      : addDays(prev, dir * Math.round(nbDays / 2))
  ));

  // Totaux globaux par jour
  const grandPrevByDay = {}, grandReelByDay = {};
  days.forEach((d) => {
    const iso = toISO(d);
    grandPrevByDay[iso] = projet.wbs.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + ((a.planning || {})[iso] || 0), 0), 0);
    grandReelByDay[iso] = projet.wbs.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + ((a.planning_reel || {})[iso] || 0), 0), 0);
  });
  const grandTotalPrev = projet.wbs.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + (a.jours_prev || 0), 0), 0);
  const grandTotalReel = projet.wbs.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + (a.jours_realises || 0), 0), 0);

  // KPI interne / externe — utile sur les projets en co-construction avec le client, où une partie
  // des tâches est affectée à des collaborateurs "EXT-" (cf. estExterne). Basé sur jours_prev
  // (charge affectée) et jours_realises, toutes tâches confondues.
  const { prevInterne, prevExterne, reelInterne, reelExterne } = useMemo(() => {
    let prevInterne = 0, prevExterne = 0, reelInterne = 0, reelExterne = 0;
    projet.wbs.forEach((n) => (n.affectations || []).forEach((a) => {
      const ext = estExterne(collaborateurs.find((c) => c.id === a.collaborateur_id));
      if (ext) { prevExterne += a.jours_prev || 0; reelExterne += a.jours_realises || 0; }
      else { prevInterne += a.jours_prev || 0; reelInterne += a.jours_realises || 0; }
    }));
    return { prevInterne, prevExterne, reelInterne, reelExterne };
  }, [projet.wbs, collaborateurs]);
  const hasExternes = prevExterne > 0 || reelExterne > 0;
  const pctExterne = (prevInterne + prevExterne) > 0 ? Math.round(prevExterne / (prevInterne + prevExterne) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: `calc(100vh - ${headerHeight}px)`, overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', borderBottom: '0.5px solid var(--color-border)', flexShrink: 0, background: 'var(--color-bg-card)', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Planning de charge</span>

        {parentIds.length > 0 && (
          <button onClick={allCollapsed ? expandAll : collapseAll}
            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--color-text-tertiary)', padding: 0 }}>
            {allCollapsed ? <ChevronDown size={13} /> : <ChevronRightIcon size={13} />}
            {allCollapsed ? 'Tout déplier' : 'Tout plier'}
          </button>
        )}

        {/* Picklist */}
        <div style={{ display: 'flex', background: 'var(--color-bg-tertiary)', borderRadius: 8, padding: 3, gap: 2 }}>
          {[['prévisionnel', '📘 Prév.'], ['réel', '📙 Réel'], ['les deux', '📊 Les deux']].map(([v, label]) => (
            <button key={v} onClick={() => setVue(v)} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: vue === v ? 'var(--color-bg-card)' : 'transparent',
              color: vue === v ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              boxShadow: vue === v ? '0 1px 3px var(--color-border)' : 'none',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Légende */}
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--color-text-secondary)' }}>
          {showPrev && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: 'var(--color-info-soft)', borderRadius: 2 }} />Prév.</span>}
          {showReel && <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: 'var(--color-success-soft)', borderRadius: 2 }} />OK</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: 'var(--color-warning-soft)', borderRadius: 2 }} />≈ prév</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: 'var(--color-danger-soft)', borderRadius: 2 }} />Dépas.</span>
          </>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: 'var(--color-danger-soft)', borderRadius: 2, border: '0.5px solid var(--color-danger)' }} />Congé</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ position: 'relative', display: 'inline-block', width: 16, height: 8, background: 'var(--color-warning-soft)', border: '1.5px solid var(--color-warning)', borderRadius: 2 }}>
              <span style={{ position: 'absolute', top: 0, right: 0, width: 4, height: 4, background: 'var(--color-warning)', borderRadius: '0 0 0 3px' }} />
            </span>
            Conflit ressource
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {ZOOM_OPTIONS.map((z) => (
            <button key={z.key} onClick={() => setZoom(z.key)} style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              background: zoom === z.key ? 'var(--color-text-primary)' : 'var(--color-bg-card)',
              color: zoom === z.key ? 'var(--color-bg-primary)' : 'var(--color-text-secondary)',
            }}>{z.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => nav(-1)} style={navBtn}><ChevronLeft size={14} /></button>
          <button onClick={() => setStartDate(startOfWeek(new Date()))} style={{ ...navBtn, fontSize: 11, padding: '5px 8px' }}>Aujourd'hui</button>
          <button onClick={() => nav(1)} style={navBtn}><ChevronRight size={14} /></button>
        </div>
        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
          {startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} → {endDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Barre de filtres */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 24px', borderBottom: '0.5px solid var(--color-border-soft)', background: 'var(--color-bg-hover)', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', marginRight: 4 }}>Filtrer :</span>
        <select value={filterCollab} onChange={(e) => setFilterCollab(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: filterCollab ? 'var(--color-accent-soft)' : 'var(--color-bg-card)', color: filterCollab ? 'var(--color-info)' : 'var(--color-text-secondary)', outline: 'none', cursor: 'pointer' }}>
          <option value="">Affecté à : Tous</option>
          {collaborateurs.filter((c) => c.actif).map((c) => (
            <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>
          ))}
        </select>
        <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: filterStatut ? 'var(--color-accent-soft)' : 'var(--color-bg-card)', color: filterStatut ? 'var(--color-info)' : 'var(--color-text-secondary)', outline: 'none', cursor: 'pointer' }}>
          <option value="">Statut : Tous</option>
          <option value="non_demarre">Non démarré</option>
          <option value="en_cours">En cours</option>
          <option value="termine">Terminé</option>
          <option value="bloque">Bloqué</option>
        </select>
        <select value={filterDelta} onChange={(e) => setFilterDelta(e.target.value)}
          style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: filterDelta ? 'var(--color-accent-soft)' : 'var(--color-bg-card)', color: filterDelta ? 'var(--color-info)' : 'var(--color-text-secondary)', outline: 'none', cursor: 'pointer' }}>
          <option value="">Δ Prév−Réel : Tous</option>
          <option value="avance">En avance (Δ &gt; 0)</option>
          <option value="depasse">Dépassé (Δ &lt; 0)</option>
        </select>
        {hasFilter && (
          <button onClick={() => { setFilterCollab(''); setFilterStatut(''); setFilterDelta(''); }}
            style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            ✕ Réinitialiser
          </button>
        )}
        {visibleIds && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginLeft: 4 }}>
            {visibleIds.size > 0 ? `${projet.wbs.filter(n => visibleIds.has(n.id) && !projet.wbs.some(c => c.parent_id === n.id)).length} tâche(s)` : 'Aucun résultat'}
          </span>
        )}

        {/* KPI Interne / Externe — visible seulement si des collaborateurs "EXT-" sont affectés
            sur ce projet (co-construction avec le client). */}
        {hasExternes && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', fontSize: 11 }} title="Charge affectée : collaborateurs internes vs externes (préfixe EXT-)">
            <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 500 }}>Interne / Externe :</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-info)', flexShrink: 0 }} />
              <strong style={{ color: 'var(--color-text-primary)' }}>{fmtJours(prevInterne)}j</strong>
              {reelInterne > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>({fmtJours(reelInterne)}j réel)</span>}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-warning)', flexShrink: 0 }} />
              <strong style={{ color: 'var(--color-warning)' }}>{fmtJours(prevExterne)}j</strong>
              {reelExterne > 0 && <span style={{ color: 'var(--color-text-tertiary)' }}>({fmtJours(reelExterne)}j réel)</span>}
            </span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>({pctExterne}% externe)</span>
          </div>
        )}
      </div>

      {/* Grille */}
      {/* contain: 'paint' isole ce tableau (nombreuses colonnes + en-têtes/colonnes sticky) de la
          recomposition déclenchée par un overlay position:fixed (ex. modale) affiché par-dessus —
          sans ça Chrome peut afficher un damier gris (« checkerboarding ») le temps de repeindre. */}
      <div style={{ flex: 1, overflow: 'auto', contain: 'paint' }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr style={{ background: 'var(--color-bg-secondary)' }}>
              <th style={{ ...thFixed, background: 'var(--color-bg-secondary)' }}>Tâche / Collaborateur</th>
              <th style={{ ...thCollab, background: 'var(--color-bg-secondary)' }}>Affecté à</th>
              <th style={{ ...thStatut, background: 'var(--color-bg-secondary)' }}>Statut</th>
              <th style={{ ...thTotal, background: 'var(--color-bg-secondary)' }}>Total</th>
              <th style={{ ...thDelta, background: 'var(--color-bg-secondary)' }}>Δ</th>
              {monthGroups.map((g) => (
                <th key={g.key} colSpan={g.days.length} style={{ ...thDay, fontWeight: 700, fontSize: 11, borderLeft: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
                  {g.label}
                </th>
              ))}
            </tr>
            <tr style={{ background: 'var(--color-bg-secondary)' }}>
              <th style={{ ...thFixed, background: 'var(--color-bg-secondary)' }} />
              <th style={{ ...thCollab, background: 'var(--color-bg-secondary)' }} />
              <th style={{ ...thStatut, background: 'var(--color-bg-secondary)' }} />
              <th style={{ ...thTotal, background: 'var(--color-bg-secondary)' }} />
              <th style={{ ...thDelta, background: 'var(--color-bg-secondary)', fontSize: 9, color: 'var(--color-text-tertiary)' }}>Prév−Réel</th>
              {days.map((d) => {
                const iso = toISO(d); const wknd = isWeekend(d); const isToday = iso === today;
                return (
                  <th key={iso} style={{
                    ...thDay,
                    background: isToday ? 'var(--color-accent-soft)' : wknd ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)',
                    color: isToday ? 'var(--color-info)' : wknd ? 'var(--color-text-tertiary)' : 'var(--color-text-secondary)',
                    fontWeight: isToday ? 700 : 400,
                    borderLeft: d.getDay() === 1 ? '1px solid var(--color-border)' : 'none',
                    borderBottom: isToday ? '2px solid var(--color-info)' : undefined,
                  }}>
                    <div style={{ fontSize: 10 }}>{JOURS[d.getDay()]}</div>
                    <div style={{ fontSize: 9, color: isToday ? 'var(--color-info)' : 'var(--color-text-tertiary)' }}>{d.getDate()}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {racines.map((node) => (
              <TaskRows key={node.id} node={node} projetId={id} depth={0}
                allNodes={projet.wbs} days={days} colWidth={COL_WIDTH}
                numeros={numeros} collaborateurs={collaborateurs}
                showPrev={showPrev} showReel={showReel}
                chargeParCollabJour={chargeParCollabJour}
                congesParCollab={congesParCollab}
                visibleIds={visibleIds} collapsedIds={collapsedIds} onToggleExpand={toggleExpand} />
            ))}

            {/* Ligne total global */}
            <tr style={{ background: 'var(--color-bg-secondary)', position: 'sticky', bottom: 0, zIndex: 5 }}>
              <td style={{ ...frozenLeft(0), background: 'var(--color-bg-secondary)', fontWeight: 700, fontSize: 12 }}>Total / jour</td>
              <td style={{ ...collabCol, background: 'var(--color-bg-secondary)' }} />
              <td style={{ ...statutCol, background: 'var(--color-bg-secondary)' }} />
              <td style={{ ...totalCol, background: 'var(--color-bg-secondary)' }}>
                {showPrev && <div style={{ fontSize: 10, color: 'var(--color-info)', fontWeight: 700 }}>{fmtJours(grandTotalPrev)}j</div>}
                {showReel && grandTotalReel > 0 && <div style={{ fontSize: 10, color: grandTotalReel > grandTotalPrev ? 'var(--color-critical)' : 'var(--color-success)', fontWeight: 700 }}>{fmtJours(grandTotalReel)}j</div>}
              </td>
              <td style={{ ...deltaCellStyle('var(--color-bg-secondary)') }}>
                {(grandTotalPrev > 0 || grandTotalReel > 0) && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: grandTotalPrev - grandTotalReel < 0 ? 'var(--color-critical)' : 'var(--color-success)' }}>
                    {grandTotalPrev - grandTotalReel > 0 ? '+' : ''}{fmtJours(grandTotalPrev - grandTotalReel)}
                  </span>
                )}
              </td>
              {days.map((d) => {
                const iso = toISO(d); const prev = grandPrevByDay[iso]; const reel = grandReelByDay[iso]; const wknd = isWeekend(d);
                return (
                  <td key={iso} style={{ width: COL_WIDTH, minWidth: COL_WIDTH, border: '0.5px solid var(--color-border)', background: wknd ? 'var(--color-bg-tertiary)' : 'var(--color-bg-secondary)', textAlign: 'center', fontSize: 10 }}>
                    {showPrev && prev > 0 && <div style={{ color: 'var(--color-info)', fontWeight: 700, lineHeight: 1.3 }}>{String(prev % 1 === 0 ? prev : prev.toFixed(1)).replace('.', ',')}</div>}
                    {showReel && reel > 0 && <div style={{ color: reel > prev * 1.1 ? 'var(--color-critical)' : reel >= prev * 0.9 ? 'var(--color-warning)' : 'var(--color-success)', fontWeight: 700, lineHeight: 1.3 }}>{String(reel % 1 === 0 ? reel : reel.toFixed(1)).replace('.', ',')}</div>}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thFixed = { position: 'sticky', left: COL_LEFT.tache, zIndex: 4, width: 340, minWidth: 340, textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)' };
const thCollab = { position: 'sticky', left: COL_LEFT.collab, zIndex: 4, width: 130, minWidth: 130, textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)' };
const thStatut = { position: 'sticky', left: COL_LEFT.statut, zIndex: 4, width: 100, minWidth: 100, textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)' };
const thTotal = { position: 'sticky', left: COL_LEFT.total, zIndex: 4, width: 48, minWidth: 48, textAlign: 'right', paddingRight: 8, fontSize: 11, color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)' };
const thDelta = { position: 'sticky', left: COL_LEFT.delta, zIndex: 4, width: 46, minWidth: 46, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border)', borderRight: '1px solid var(--color-border)' };
const collabCol = { position: 'sticky', left: COL_LEFT.collab, zIndex: 2, width: 130, minWidth: 130, padding: '2px 6px', borderRight: '1px solid var(--color-border)', borderBottom: '0.5px solid var(--color-border-soft)', verticalAlign: 'middle' };
const statutCol = { position: 'sticky', left: COL_LEFT.statut, zIndex: 2, width: 100, minWidth: 100, padding: '2px 6px', borderRight: '1px solid var(--color-border)', borderBottom: '0.5px solid var(--color-border-soft)', verticalAlign: 'middle' };
const collabSelectStyle = { width: '100%', fontSize: 11, border: '1px solid var(--color-border)', borderRadius: 4, padding: '2px 4px', background: 'var(--color-bg-card)', color: 'var(--color-text-primary)', cursor: 'pointer', fontFamily: 'inherit', outline: 'none' };
const statutSelectStyle = { width: '100%', fontSize: 11, border: '1px solid', borderRadius: 4, padding: '2px 4px', background: 'var(--color-bg-card)', cursor: 'pointer', fontFamily: 'inherit', outline: 'none', fontWeight: 500 };
const thDay = { width: COL_WIDTH, minWidth: COL_WIDTH, textAlign: 'center', padding: '3px 0', fontSize: 10, color: 'var(--color-text-secondary)', border: '0.5px solid var(--color-border-soft)' };
const navBtn = { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-card)', cursor: 'pointer', display: 'flex', alignItems: 'center', color: 'var(--color-text-secondary)' };

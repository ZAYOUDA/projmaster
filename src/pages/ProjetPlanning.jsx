import React, { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { calculerNumeroWBS } from '../data/calculations';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';

// ── Utilitaires date ──────────────────────────────────────────────
const JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MOIS_LABELS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

function toISO(d) { return d.toISOString().slice(0, 10); }

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
  if (wknd) return '#F0EEE8';
  if (reel === 0) return '#fff';
  if (prev === 0) return '#FAE8E4';
  if (reel > prev * 1.1) return '#FAE8E4';
  if (reel >= prev * 0.9) return '#FFF3CD';
  return '#E6F5EE';
}
function reelColor(reel, prev) {
  if (reel === 0) return '#CCC';
  if (prev === 0 || reel > prev * 1.1) return '#C0391B';
  if (reel >= prev * 0.9) return '#8A5A00';
  return '#0E7A45';
}

// ── Δ helpers ─────────────────────────────────────────────────────
function DeltaCell({ delta, bg }) {
  if (delta === null || delta === undefined) return <td style={deltaCellStyle(bg)} />;
  const isNeg = delta < 0;
  const isZero = delta === 0;
  return (
    <td style={deltaCellStyle(bg)}>
      <span style={{ fontSize: 11, fontWeight: 600, color: isZero ? '#888780' : isNeg ? '#C0391B' : '#0E7A45' }}>
        {isNeg ? '' : '+'}{delta % 1 === 0 ? delta : delta.toFixed(1)}
      </span>
    </td>
  );
}
const deltaCellStyle = (bg) => ({
  width: 46, minWidth: 46, textAlign: 'center',
  borderRight: '1px solid rgba(0,0,0,0.12)',
  borderBottom: '0.5px solid rgba(0,0,0,0.07)',
  background: bg || 'inherit', verticalAlign: 'middle',
});

// ── Cellule charge éditable ───────────────────────────────────────
function ChargeCell({ value, onChange, bg, color, colWidth, conflict }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const startEdit = () => { setDraft(value > 0 ? String(value).replace('.', ',') : ''); setEditing(true); };
  const commit = () => { onChange(Math.min(1, Math.max(0, parseFloat(draft.replace(',', '.')) || 0))); setEditing(false); };

  // Conflit : bordure orange avec petit indicateur
  const conflictStyle = conflict ? {
    outline: '1.5px solid #E8A020',
    outlineOffset: '-1.5px',
    background: value > 0 ? bg : '#FFF8EC',
  } : {};

  return (
    <td
      onClick={startEdit}
      title={conflict ? `⚠️ ${conflict} déjà planifié(e) ce jour sur une autre tâche` : undefined}
      style={{
        width: colWidth, minWidth: colWidth, maxWidth: colWidth,
        height: 26, padding: 0,
        border: '0.5px solid rgba(0,0,0,0.07)',
        background: bg, cursor: 'pointer', textAlign: 'center', verticalAlign: 'middle',
        position: 'relative',
        ...conflictStyle,
      }}
    >
      {conflict && !editing && (
        <span style={{
          position: 'absolute', top: 0, right: 0,
          width: 5, height: 5, borderRadius: '0 0 0 5px',
          background: '#E8A020', zIndex: 1,
        }} />
      )}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') setEditing(false);
          }}
          style={{
            width: '100%', height: '100%', border: '2px solid #378ADD',
            textAlign: 'center', fontSize: 11, outline: 'none',
            background: '#EBF7FF', fontFamily: 'inherit', padding: 0,
          }}
        />
      ) : (
        <span style={{ fontSize: 11, color: value > 0 ? color : '#D8D6D0', fontWeight: value > 0 ? 600 : 400 }}>
          {value > 0 ? String(value % 1 === 0 ? value : value.toFixed(1)).replace('.', ',') : '·'}
        </span>
      )}
    </td>
  );
}

// ── Lignes d'une tâche ────────────────────────────────────────────
function TaskRows({ node, projetId, depth, allNodes, days, colWidth, numeros, collaborateurs, showPrev, showReel, chargeParCollabJour, congesParCollab }) {
  const [expanded, setExpanded] = useState(true);
  const [filling, setFilling] = useState(null); // affId en cours de remplissage
  const [fillVal, setFillVal] = useState('1');
  const setChargePlanning = useAppStore((s) => s.setChargePlanning);
  const setChargePlanningReel = useAppStore((s) => s.setChargePlanningReel);

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

  const totalJoursPrev = (node.affectations || []).reduce((s, a) => s + (a.jours_prev || 0), 0);
  const totalJoursReel = (node.affectations || []).reduce((s, a) => s + (a.jours_realises || 0), 0);
  const delta = (showPrev && showReel) ? totalJoursPrev - totalJoursReel : null;

  const totalPrevByDay = {};
  const totalReelByDay = {};
  days.forEach((d) => {
    const iso = toISO(d);
    totalPrevByDay[iso] = (node.affectations || []).reduce((s, a) => s + ((a.planning || {})[iso] || 0), 0);
    totalReelByDay[iso] = (node.affectations || []).reduce((s, a) => s + ((a.planning_reel || {})[iso] || 0), 0);
  });

  const headerBg = depth === 0 ? '#F0EFF9' : '#F8F8FB';

  return (
    <>
      {/* Ligne titre tâche */}
      <tr style={{ background: headerBg }}>
        <td style={{ ...frozenLeft(depth), background: headerBg }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {hasChildren ? (
              <button onClick={() => setExpanded(!expanded)} style={chevronBtn}>
                {expanded ? <ChevronDown size={12} /> : <ChevronRightIcon size={12} />}
              </button>
            ) : <span style={{ width: 16, flexShrink: 0 }} />}
            <span style={{ fontSize: 10, color: '#888780', fontFamily: 'monospace', marginRight: 4, flexShrink: 0 }}>{numero}</span>
            <span style={{ fontSize: 12, fontWeight: depth === 0 ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.nom}
            </span>
          </div>
        </td>
        {/* Total */}
        <td style={{ ...totalCol, background: headerBg }}>
          {showPrev && <div style={{ fontSize: 10, color: '#378ADD', fontWeight: 600 }}>{totalJoursPrev > 0 ? `${totalJoursPrev}j` : ''}</div>}
          {showReel && totalJoursReel > 0 && (
            <div style={{ fontSize: 10, color: totalJoursReel > totalJoursPrev ? '#C0391B' : '#0E7A45', fontWeight: 600 }}>{totalJoursReel}j</div>
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
              border: '0.5px solid rgba(0,0,0,0.07)',
              background: wknd ? '#EEECE6' : headerBg,
              textAlign: 'center', fontSize: 10, height: 26,
              borderLeft: d.getDay() === 1 ? '1px solid rgba(0,0,0,0.1)' : undefined,
            }}>
              {showPrev && prev > 0 && <div style={{ color: '#378ADD', fontWeight: 600, lineHeight: 1.2 }}>{String(prev % 1 === 0 ? prev : prev.toFixed(1)).replace('.', ',')}</div>}
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
        const affDelta = (showPrev && showReel) ? joursPrev - joursReel : null;

        return (
          <React.Fragment key={aff.id}>
            {showPrev && (
              <tr style={{ background: '#FAFAFE' }}>
                <td style={{ ...frozenLeft(depth + 1), background: '#FAFAFE' }}>
                  {filling === aff.id ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 16 }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: collab.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {collab.initiales}
                      </div>
                      <span style={{ fontSize: 10, color: '#5F5E5A', flexShrink: 0 }}>Remplir :</span>
                      <input
                        autoFocus
                        value={fillVal}
                        onChange={(e) => setFillVal(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') doFill(aff.id, aff.collaborateur_id, fillVal); if (e.key === 'Escape') setFilling(null); }}
                        style={{ width: 36, padding: '1px 4px', border: '1.5px solid #378ADD', borderRadius: 4, fontSize: 11, textAlign: 'center', fontFamily: 'inherit', outline: 'none' }}
                      />
                      <button onClick={() => doFill(aff.id, aff.collaborateur_id, fillVal)} style={{ padding: '1px 6px', borderRadius: 4, border: 'none', background: '#378ADD', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>OK</button>
                      <button onClick={() => setFilling(null)} style={{ padding: '1px 5px', borderRadius: 4, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', fontSize: 11, cursor: 'pointer', color: '#888', flexShrink: 0 }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 16, flexShrink: 0 }} />
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: collab.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {collab.initiales}
                      </div>
                      <span style={{ fontSize: 11, color: '#5F5E5A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{collab.prenom} {collab.nom}</span>
                      <span style={{ fontSize: 9, background: '#E6F0FB', color: '#378ADD', borderRadius: 4, padding: '1px 4px', flexShrink: 0, fontWeight: 600 }}>PRÉ</span>
                      <button
                        onClick={() => { setFilling(aff.id); setFillVal('1'); }}
                        title="Remplir tous les jours visibles"
                        style={{ marginLeft: 'auto', padding: '1px 5px', borderRadius: 4, border: '1px solid rgba(55,138,221,0.3)', background: '#EBF5FF', color: '#378ADD', fontSize: 10, cursor: 'pointer', flexShrink: 0 }}
                      >↔</button>
                    </div>
                  )}
                </td>
                <td style={{ ...totalCol, background: '#FAFAFE', color: '#378ADD', fontSize: 11, fontWeight: 600 }}>
                  {joursPrev > 0 ? `${joursPrev}j` : ''}
                </td>
                {/* Δ sur ligne prév : vide si showReel aussi, sinon rien */}
                <DeltaCell delta={showReel ? null : null} bg='#FAFAFE' />
                {days.map((d) => {
                  const iso = toISO(d);
                  const value = (aff.planning || {})[iso] || 0;
                  const wknd = isWeekend(d);
                  const isConge = (congesParCollab[aff.collaborateur_id]?.[iso] || 0) > 0;
                  // Conflit : charge totale ce jour pour ce collab (toutes tâches) - valeur actuelle > 0
                  const totalJourCollab = (chargeParCollabJour[aff.collaborateur_id] || {})[iso] || 0;
                  const autresTaches = totalJourCollab - value;
                  const conflict = !isConge && autresTaches > 0 ? collab.prenom : null;
                  const bg = isConge ? '#FEE2E2' : wknd ? '#F0EEE8' : value >= 1 ? '#DAEEF8' : value > 0 ? '#EBF5FB' : '#FAFAFE';
                  return isConge ? (
                    <td key={iso} title={`Congé — ${collab.prenom} ${collab.nom}`} style={{
                      width: colWidth, minWidth: colWidth, height: 26, border: '0.5px solid rgba(0,0,0,0.07)',
                      background: '#FEE2E2', textAlign: 'center', verticalAlign: 'middle', cursor: 'not-allowed',
                    }}>
                      <span style={{ fontSize: 10, color: '#DC2626' }}>✕</span>
                    </td>
                  ) : (
                    <ChargeCell key={iso} value={value} isWeekend={wknd} colWidth={colWidth} bg={bg} color='#1A6E9B' conflict={conflict}
                      onChange={(v) => setChargePlanning(projetId, node.id, aff.id, iso, v)} />
                  );
                })}
              </tr>
            )}
            {showReel && (
              <tr style={{ background: '#FFFDF9' }}>
                <td style={{ ...frozenLeft(depth + 1), background: '#FFFDF9', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 16, flexShrink: 0 }} />
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: collab.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0, opacity: 0.6 }}>
                      {collab.initiales}
                    </div>
                    <span style={{ fontSize: 11, color: '#888780', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{collab.prenom} {collab.nom}</span>
                    <span style={{ fontSize: 9, background: '#FFF0E0', color: '#BA7517', borderRadius: 4, padding: '1px 4px', flexShrink: 0, fontWeight: 600 }}>RÉE</span>
                  </div>
                </td>
                <td style={{ ...totalCol, background: '#FFFDF9', fontSize: 11, fontWeight: 600, borderBottom: '1px solid rgba(0,0,0,0.08)', color: joursReel > joursPrev ? '#C0391B' : joursReel > 0 ? '#0E7A45' : '#CCC' }}>
                  {joursReel > 0 ? `${joursReel}j` : ''}
                </td>
                {/* Δ sur ligne réel */}
                <DeltaCell delta={showPrev ? affDelta : null} bg='#FFFDF9' />
                {days.map((d) => {
                  const iso = toISO(d);
                  const reel = (aff.planning_reel || {})[iso] || 0;
                  const prev = (aff.planning || {})[iso] || 0;
                  const wknd = isWeekend(d);
                  const bg = wknd ? '#F0EEE8' : reelBg(reel, prev, false);
                  return (
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
          chargeParCollabJour={chargeParCollabJour} congesParCollab={congesParCollab} />
      ))}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────
const frozenLeft = (depth) => ({
  position: 'sticky', left: 0, zIndex: 2, background: 'inherit',
  width: 290, minWidth: 290,
  padding: `0 8px 0 ${8 + depth * 14}px`,
  fontSize: 12, borderRight: '1px solid rgba(0,0,0,0.1)',
  whiteSpace: 'nowrap', overflow: 'hidden', height: 26,
  borderBottom: '0.5px solid rgba(0,0,0,0.07)',
});
const totalCol = {
  width: 48, minWidth: 48, textAlign: 'right', paddingRight: 8,
  fontSize: 11, fontWeight: 600,
  borderBottom: '0.5px solid rgba(0,0,0,0.07)', verticalAlign: 'middle',
};
const chevronBtn = { background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: '#888780', flexShrink: 0 };

// ── Page ─────────────────────────────────────────────────────────
const ZOOM_OPTIONS = [
  { key: '4w', label: '4 sem.',  days: 28 },
  { key: '2m', label: '2 mois', days: 62 },
  { key: '3m', label: '3 mois', days: 92 },
  { key: '6m', label: '6 mois', days: 184 },
];
const COL_WIDTH = 34;
const today = toISO(new Date());

export default function ProjetPlanning() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const collaborateurs = useAppStore((s) => s.collaborateurs);

  const [startDate, setStartDate] = useState(() => startOfWeek(new Date()));
  const [zoom, setZoom] = useState('2m');
  const [vue, setVue] = useState('les deux');

  const showPrev = vue === 'prévisionnel' || vue === 'les deux';
  const showReel = vue === 'réel' || vue === 'les deux';

  const nbDays = ZOOM_OPTIONS.find((z) => z.key === zoom)?.days || 62;
  const endDate = addDays(startDate, nbDays - 1);
  const days = getDaysInRange(startDate, endDate);
  const monthGroups = groupByMonth(days);

  const numeros = calculerNumeroWBS(projet.wbs);
  const racines = projet.wbs.filter((n) => n.parent_id === null).sort((a, b) => a.ordre - b.ordre);

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

  const nav = (dir) => setStartDate((prev) => addDays(prev, dir * Math.round(nbDays / 2)));

  // Totaux globaux par jour
  const grandPrevByDay = {}, grandReelByDay = {};
  days.forEach((d) => {
    const iso = toISO(d);
    grandPrevByDay[iso] = projet.wbs.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + ((a.planning || {})[iso] || 0), 0), 0);
    grandReelByDay[iso] = projet.wbs.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + ((a.planning_reel || {})[iso] || 0), 0), 0);
  });
  const grandTotalPrev = projet.wbs.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + (a.jours_prev || 0), 0), 0);
  const grandTotalReel = projet.wbs.reduce((s, n) => s + (n.affectations || []).reduce((sa, a) => sa + (a.jours_realises || 0), 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 24px', borderBottom: '0.5px solid rgba(0,0,0,0.1)', flexShrink: 0, background: '#fff', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>Planning de charge</span>

        {/* Picklist */}
        <div style={{ display: 'flex', background: '#F1EFE8', borderRadius: 8, padding: 3, gap: 2 }}>
          {[['prévisionnel', '📘 Prév.'], ['réel', '📙 Réel'], ['les deux', '📊 Les deux']].map(([v, label]) => (
            <button key={v} onClick={() => setVue(v)} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500,
              background: vue === v ? '#fff' : 'transparent',
              color: vue === v ? '#1A1A18' : '#888780',
              boxShadow: vue === v ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s',
            }}>{label}</button>
          ))}
        </div>

        {/* Légende */}
        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#5F5E5A' }}>
          {showPrev && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: '#DAEEF8', borderRadius: 2 }} />Prév.</span>}
          {showReel && <>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: '#E6F5EE', borderRadius: 2 }} />OK</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: '#FFF3CD', borderRadius: 2 }} />≈ prév</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: '#FAE8E4', borderRadius: 2 }} />Dépas.</span>
          </>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ display: 'inline-block', width: 16, height: 8, background: '#FEE2E2', borderRadius: 2, border: '0.5px solid #FECACA' }} />Congé</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ position: 'relative', display: 'inline-block', width: 16, height: 8, background: '#FFF8EC', border: '1.5px solid #E8A020', borderRadius: 2 }}>
              <span style={{ position: 'absolute', top: 0, right: 0, width: 4, height: 4, background: '#E8A020', borderRadius: '0 0 0 3px' }} />
            </span>
            Conflit ressource
          </span>
        </div>

        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {ZOOM_OPTIONS.map((z) => (
            <button key={z.key} onClick={() => setZoom(z.key)} style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
              background: zoom === z.key ? '#1A1A18' : '#fff',
              color: zoom === z.key ? '#fff' : '#5F5E5A',
            }}>{z.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => nav(-1)} style={navBtn}><ChevronLeft size={14} /></button>
          <button onClick={() => setStartDate(startOfWeek(new Date()))} style={{ ...navBtn, fontSize: 11, padding: '5px 8px' }}>Aujourd'hui</button>
          <button onClick={() => nav(1)} style={navBtn}><ChevronRight size={14} /></button>
        </div>
        <span style={{ fontSize: 11, color: '#888780' }}>
          {startDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} → {endDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Grille */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr style={{ background: '#EEEDF5' }}>
              <th style={{ ...thFixed, background: '#EEEDF5' }}>Tâche / Collaborateur</th>
              <th style={{ ...thTotal, background: '#EEEDF5' }}>Total</th>
              <th style={{ ...thDelta, background: '#EEEDF5' }}>Δ</th>
              {monthGroups.map((g) => (
                <th key={g.key} colSpan={g.days.length} style={{ ...thDay, fontWeight: 700, fontSize: 11, borderLeft: '1px solid rgba(0,0,0,0.15)', background: '#EEEDF5' }}>
                  {g.label}
                </th>
              ))}
            </tr>
            <tr style={{ background: '#F5F4FB' }}>
              <th style={{ ...thFixed, background: '#F5F4FB' }} />
              <th style={{ ...thTotal, background: '#F5F4FB' }} />
              <th style={{ ...thDelta, background: '#F5F4FB', fontSize: 9, color: '#888780' }}>Prév−Réel</th>
              {days.map((d) => {
                const iso = toISO(d); const wknd = isWeekend(d); const isToday = iso === today;
                return (
                  <th key={iso} style={{
                    ...thDay,
                    background: isToday ? '#EBF4FF' : wknd ? '#EEECE6' : '#F5F4FB',
                    color: isToday ? '#378ADD' : wknd ? '#AAA9A4' : '#5F5E5A',
                    fontWeight: isToday ? 700 : 400,
                    borderLeft: d.getDay() === 1 ? '1px solid rgba(0,0,0,0.1)' : 'none',
                    borderBottom: isToday ? '2px solid #378ADD' : undefined,
                  }}>
                    <div style={{ fontSize: 10 }}>{JOURS[d.getDay()]}</div>
                    <div style={{ fontSize: 9, color: isToday ? '#378ADD' : '#AAA9A4' }}>{d.getDate()}</div>
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
                congesParCollab={congesParCollab} />
            ))}

            {/* Ligne total global */}
            <tr style={{ background: '#EEEDF5', position: 'sticky', bottom: 0, zIndex: 5 }}>
              <td style={{ ...frozenLeft(0), background: '#EEEDF5', fontWeight: 700, fontSize: 12 }}>Total / jour</td>
              <td style={{ ...totalCol, background: '#EEEDF5' }}>
                {showPrev && <div style={{ fontSize: 10, color: '#378ADD', fontWeight: 700 }}>{grandTotalPrev}j</div>}
                {showReel && grandTotalReel > 0 && <div style={{ fontSize: 10, color: grandTotalReel > grandTotalPrev ? '#C0391B' : '#0E7A45', fontWeight: 700 }}>{grandTotalReel}j</div>}
              </td>
              <td style={{ ...deltaCellStyle('#EEEDF5') }}>
                {showPrev && showReel && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: grandTotalPrev - grandTotalReel < 0 ? '#C0391B' : '#0E7A45' }}>
                    {grandTotalPrev - grandTotalReel > 0 ? '+' : ''}{grandTotalPrev - grandTotalReel}
                  </span>
                )}
              </td>
              {days.map((d) => {
                const iso = toISO(d); const prev = grandPrevByDay[iso]; const reel = grandReelByDay[iso]; const wknd = isWeekend(d);
                return (
                  <td key={iso} style={{ width: COL_WIDTH, minWidth: COL_WIDTH, border: '0.5px solid rgba(0,0,0,0.1)', background: wknd ? '#EEECE6' : '#EEEDF5', textAlign: 'center', fontSize: 10 }}>
                    {showPrev && prev > 0 && <div style={{ color: '#378ADD', fontWeight: 700, lineHeight: 1.3 }}>{String(prev % 1 === 0 ? prev : prev.toFixed(1)).replace('.', ',')}</div>}
                    {showReel && reel > 0 && <div style={{ color: reel > prev * 1.1 ? '#C0391B' : reel >= prev * 0.9 ? '#8A5A00' : '#0E7A45', fontWeight: 700, lineHeight: 1.3 }}>{String(reel % 1 === 0 ? reel : reel.toFixed(1)).replace('.', ',')}</div>}
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

const thFixed = { position: 'sticky', left: 0, zIndex: 3, width: 290, minWidth: 290, textAlign: 'left', padding: '6px 8px', fontSize: 11, fontWeight: 600, color: '#5F5E5A', border: '0.5px solid rgba(0,0,0,0.1)' };
const thTotal = { width: 48, minWidth: 48, textAlign: 'right', paddingRight: 8, fontSize: 11, color: '#5F5E5A', border: '0.5px solid rgba(0,0,0,0.1)', borderRight: 'none' };
const thDelta = { width: 46, minWidth: 46, textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#5F5E5A', border: '0.5px solid rgba(0,0,0,0.1)', borderRight: '1px solid rgba(0,0,0,0.15)' };
const thDay = { width: COL_WIDTH, minWidth: COL_WIDTH, textAlign: 'center', padding: '3px 0', fontSize: 10, color: '#5F5E5A', border: '0.5px solid rgba(0,0,0,0.07)' };
const navBtn = { padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#5F5E5A' };

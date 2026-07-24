import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ChevronRight, ChevronDown } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { calculerBudgetNoeud, formatCurrency, agregerDatesEtAvancement } from '../data/calculations';
import PageHeader from '../components/layout/PageHeader';

// ── Zoom levels ───────────────────────────────────────────────────
const ZOOMS = {
  semaine:   { label: 'Semaine',   pxPerDay: 24 },
  mois:      { label: 'Mois',      pxPerDay: 6  },
  trimestre: { label: 'Trimestre', pxPerDay: 3  },
};

const ROW_H = 52;       // height per task row (prev + real bars)
const HEADER_H = 48;    // month/week header height
const LEFT_W = 220;     // left label panel width

// ── Date utilities ────────────────────────────────────────────────
function toDate(str) { return str ? new Date(str) : null; }
function diffDays(a, b) { return Math.round((b - a) / 86400000); }
function addDays(d, n) { return new Date(d.getTime() + n * 86400000); }

function fmtDate(d) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

function monthsInRange(start, end) {
  const months = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    months.push(new Date(cur));
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}

function weeksInRange(start, end) {
  const weeks = [];
  // align to Monday
  const cur = new Date(start);
  cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7));
  while (cur <= end) {
    weeks.push(new Date(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

// Enfants directs affichables dans le Gantt (les jalons WBS ne sont pas rendus comme des barres)
function getChildren(node, allNodes) {
  return allNodes.filter((n) => n.parent_id === node.id && n.type !== 'jalon').sort((a, b) => a.ordre - b.ordre);
}

const agregerNoeud = agregerDatesEtAvancement;

// ── Tooltip ───────────────────────────────────────────────────────
function Tooltip({ node, agg, budget, couleur, x, y }) {
  const prevDuration = agg.date_debut_prev && agg.date_fin_prev
    ? diffDays(new Date(agg.date_debut_prev), new Date(agg.date_fin_prev)) + 1
    : null;

  const ecartDebut = agg.date_debut_prev && agg.date_debut_reel
    ? diffDays(new Date(agg.date_debut_prev), new Date(agg.date_debut_reel))
    : null;

  return (
    <div style={{
      position: 'fixed', left: x + 12, top: y - 8, zIndex: 9999,
      background: '#1A1A18', color: '#fff', borderRadius: 10, padding: '12px 16px',
      fontSize: 12, lineHeight: 1.7, width: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
      pointerEvents: 'none',
    }}>
      <p style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 600, color: couleur }}>{node.nom}</p>
      {agg.date_debut_prev && agg.date_fin_prev && (
        <p style={{ margin: 0, color: '#ccc' }}>
          <span style={{ color: '#aaa' }}>Prévu :</span> {fmtDate(agg.date_debut_prev)} → {fmtDate(agg.date_fin_prev)}{prevDuration ? ` (${prevDuration} j)` : ''}
        </p>
      )}
      {agg.date_debut_reel && (
        <p style={{ margin: 0, color: '#ccc' }}>
          <span style={{ color: '#aaa' }}>Réel :</span> {fmtDate(agg.date_debut_reel)} → {agg.date_fin_reel ? fmtDate(agg.date_fin_reel) : 'en cours'} (avancement : {agg.avancement}%)
        </p>
      )}
      {ecartDebut !== null && ecartDebut !== 0 && (
        <p style={{ margin: 0, color: ecartDebut > 0 ? '#F87171' : '#6EE7B7' }}>
          Écart démarrage : {ecartDebut > 0 ? '+' : ''}{ecartDebut} jours
        </p>
      )}
      {budget.prev > 0 && (
        <p style={{ margin: '6px 0 0', borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 6, color: '#ccc' }}>
          <span style={{ color: '#aaa' }}>Budget :</span> {formatCurrency(budget.prev)} prév. / {formatCurrency(budget.conso)} conso.
        </p>
      )}
    </div>
  );
}

// ── Barre Gantt ───────────────────────────────────────────────────
function GanttBar({ node, agg, minDate, pxPerDay, couleur, tjm, allNodes, depth = 0, onHover }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const budget = calculerBudgetNoeud(node, allNodes, tjm);
  const opacite = Math.max(0.55, 0.9 - depth * 0.15);
  const barHeight = depth === 0 ? 16 : 12;
  const barYPrev = depth === 0 ? 6 : 8;
  const barYReel = depth === 0 ? 26 : 26;

  const barX = (d) => Math.max(0, diffDays(minDate, new Date(d)) * pxPerDay);
  const barW = (s, e) => Math.max(2, diffDays(new Date(s), new Date(e)) * pxPerDay);

  const hasPrev = agg.date_debut_prev && agg.date_fin_prev;
  const hasReel = agg.date_debut_reel;

  if (!hasPrev && !hasReel) return null;

  const prevX = hasPrev ? barX(agg.date_debut_prev) : 0;
  const prevW = hasPrev ? barW(agg.date_debut_prev, agg.date_fin_prev) : 0;

  let reelX = 0, reelW = 0, reelEnd = null;
  if (hasReel) {
    reelX = barX(agg.date_debut_reel);
    const endDate = agg.date_fin_reel ? new Date(agg.date_fin_reel) : today;
    reelEnd = agg.date_fin_reel;
    reelW = barW(agg.date_debut_reel, endDate);
  }

  const isLate = hasPrev && hasReel && reelW > prevW + 2;

  const handleMouseEnter = (e) => {
    onHover({ node, agg, budget, x: e.clientX, y: e.clientY });
  };
  const handleMouseMove = (e) => {
    onHover({ node, agg, budget, x: e.clientX, y: e.clientY });
  };
  const handleMouseLeave = () => onHover(null);

  return (
    <g
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: 'default' }}
    >
      {/* Prévisionnelle — claire */}
      {hasPrev && (
        <rect
          x={prevX} y={barYPrev} width={prevW} height={barHeight}
          rx={4} fill={couleur} opacity={opacite * 0.35}
        />
      )}
      {/* Réelle — foncée (pleine opacité) */}
      {hasReel && (
        <>
          <rect
            x={reelX} y={barYReel} width={reelW} height={barHeight}
            rx={4}
            fill={isLate ? '#D85A30' : couleur}
            opacity={Math.min(1, opacite + 0.1)}
          />
          {/* Indicateur avancement — trait clair pour ressortir sur la barre pleine */}
          {agg.avancement > 0 && (
            <rect
              x={reelX + reelW * agg.avancement / 100 - 1}
              y={barYReel - 2} width={2} height={barHeight + 4}
              fill="#fff"
              opacity={0.85}
              rx={1}
            />
          )}
        </>
      )}
    </g>
  );
}

// ── Page Gantt ────────────────────────────────────────────────────
export default function ProjetGantt() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const [zoom, setZoom] = useState('mois');
  const [hovering, setHovering] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());

  const { pxPerDay } = ZOOMS[zoom];

  // Uniquement les nœuds niveau 1 (racines, hors jalons pour les barres)
  const racines = useMemo(
    () => projet.wbs.filter((n) => n.parent_id === null && n.type !== 'jalon').sort((a, b) => a.ordre - b.ordre),
    [projet.wbs]
  );

  const jalons = useMemo(
    () => projet.milestones.filter((m) => m.statut !== 'atteint'),
    [projet.milestones]
  );

  // Agrégation des racines (sert de référence stable pour la plage temporelle globale,
  // indépendamment de ce qui est déplié)
  const racinesAvecAgg = useMemo(
    () => racines.map((n) => ({ node: n, agg: agregerNoeud(n, projet.wbs) })),
    [racines, projet.wbs]
  );

  const toggleExpand = (nodeId) => setExpandedIds((prev) => {
    const next = new Set(prev);
    next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
    return next;
  });

  const parentIds = useMemo(
    () => projet.wbs.filter((n) => getChildren(n, projet.wbs).length > 0).map((n) => n.id),
    [projet.wbs]
  );
  const allExpanded = parentIds.length > 0 && parentIds.every((pid) => expandedIds.has(pid));
  const toggleExpandAll = () => setExpandedIds(allExpanded ? new Set() : new Set(parentIds));

  // Lignes visibles (livrables + tâches/sous-tâches dépliées), avec leur profondeur pour l'indentation
  const visibleRows = useMemo(() => {
    const rows = [];
    const walk = (node, depth) => {
      rows.push({ node, depth, agg: agregerNoeud(node, projet.wbs), children: getChildren(node, projet.wbs) });
      if (expandedIds.has(node.id)) {
        getChildren(node, projet.wbs).forEach((c) => walk(c, depth + 1));
      }
    };
    racines.forEach((n) => walk(n, 0));
    return rows;
  }, [racines, projet.wbs, expandedIds]);

  // Plage temporelle globale (basée sur les racines : leur agrégation couvre déjà tous les descendants)
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const allDates = [
      ...racinesAvecAgg.flatMap(({ agg }) => [agg.date_debut_prev, agg.date_fin_prev, agg.date_debut_reel, agg.date_fin_reel]),
      ...jalons.map((m) => m.date_prevue),
    ].filter(Boolean).map((d) => new Date(d));

    if (allDates.length === 0) {
      const now = new Date();
      return { minDate: now, maxDate: addDays(now, 90), totalDays: 90 };
    }

    const min = new Date(Math.min(...allDates));
    const max = new Date(Math.max(...allDates));
    // padding
    min.setDate(min.getDate() - 7);
    max.setDate(max.getDate() + 14);
    return { minDate: min, maxDate: max, totalDays: diffDays(min, max) };
  }, [racinesAvecAgg, jalons]);

  const totalW = totalDays * pxPerDay;
  const svgH = HEADER_H + (visibleRows.length + jalons.length) * ROW_H + 20;
  const today = new Date();
  const todayX = diffDays(minDate, today) * pxPerDay;

  // En-tête : mois ou semaines
  const months = monthsInRange(minDate, maxDate);

  if (projet.wbs.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: '#888780', marginTop: 80 }}>
        <p style={{ fontSize: 15, fontWeight: 500 }}>Gantt</p>
        <p style={{ fontSize: 13 }}>Aucune tâche dans le WBS. Commencez par créer des livrables.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 32 }}>
      <PageHeader
        title="Gantt"
        subtitle={parentIds.length > 0 ? 'Livrables — déplie une ligne pour voir ses tâches' : 'Livrables'}
        actions={
          <>
            {parentIds.length > 0 && (
              <button
                onClick={toggleExpandAll}
                style={{
                  padding: '7px 14px', borderRadius: 7, border: '1px solid rgba(0,0,0,0.12)',
                  background: '#fff', color: '#5F5E5A', fontSize: 13, cursor: 'pointer',
                }}
              >
                {allExpanded ? 'Tout replier' : 'Tout déplier'}
              </button>
            )}
            <div style={{ display: 'flex', border: '1px solid rgba(0,0,0,0.12)', borderRadius: 7, overflow: 'hidden' }}>
              {Object.entries(ZOOMS).map(([key, z]) => (
                <button
                  key={key}
                  onClick={() => setZoom(key)}
                  style={{
                    padding: '7px 14px', border: 'none', cursor: 'pointer', fontSize: 13,
                    background: zoom === key ? '#1A1A18' : '#fff',
                    color: zoom === key ? '#fff' : '#5F5E5A',
                    borderRight: key !== 'trimestre' ? '1px solid rgba(0,0,0,0.12)' : 'none',
                  }}
                >
                  {z.label}
                </button>
              ))}
            </div>
          </>
        }
      />

      {/* Légende */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 10, background: projet.couleur, borderRadius: 3, opacity: 0.35 }} />
          <span style={{ fontSize: 12, color: '#5F5E5A' }}>Prévisionnelle</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 10, background: projet.couleur, borderRadius: 3, opacity: 1 }} />
          <span style={{ fontSize: 12, color: '#5F5E5A' }}>Réelle</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 2, height: 14, background: projet.couleur }} />
          <span style={{ fontSize: 12, color: '#5F5E5A' }}>% avancement</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 10, background: '#D85A30', borderRadius: 3, opacity: 0.7 }} />
          <span style={{ fontSize: 12, color: '#5F5E5A' }}>Dépassement</span>
        </div>
      </div>

      {/* Conteneur scrollable */}
      <div style={{ display: 'flex', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        {/* Panel gauche — noms des tâches */}
        <div style={{ width: LEFT_W, flexShrink: 0, borderRight: '0.5px solid rgba(0,0,0,0.08)' }}>
          {/* En-tête gauche */}
          <div style={{ height: HEADER_H, borderBottom: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Livrable</span>
          </div>
          {/* Lignes tâches (livrables L1, et sous-tâches dépliées en dessous) */}
          {visibleRows.map(({ node, agg, depth, children }) => (
            <div
              key={node.id}
              style={{
                height: ROW_H, display: 'flex', alignItems: 'center', gap: 4,
                padding: `0 16px 0 ${16 + depth * 16}px`,
                borderBottom: '0.5px solid rgba(0,0,0,0.05)',
              }}
            >
              {children.length > 0 ? (
                <button
                  onClick={() => toggleExpand(node.id)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: '#888780', flexShrink: 0 }}
                  title={expandedIds.has(node.id) ? 'Replier' : `Déplier (${children.length})`}
                >
                  {expandedIds.has(node.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              ) : <span style={{ width: 14, flexShrink: 0 }} />}
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: depth === 0 ? 13 : 12.5, fontWeight: depth === 0 ? 500 : 400, color: depth === 0 ? '#1A1A18' : '#5F5E5A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: LEFT_W - 32 - depth * 16 }}>
                  {node.nom}
                </p>
                <p style={{ margin: 0, fontSize: 11, color: '#888780' }}>{agg.avancement}%</p>
              </div>
            </div>
          ))}
          {/* Jalons label */}
          {jalons.length > 0 && (
            <div style={{ height: 28, display: 'flex', alignItems: 'center', padding: '0 16px', background: '#F8F8F7', borderTop: '0.5px solid rgba(0,0,0,0.08)' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Jalons</span>
            </div>
          )}
          {jalons.map((m) => (
            <div key={m.id} style={{ height: ROW_H, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '0.5px solid rgba(0,0,0,0.05)' }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 500, color: '#1A1A18', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: LEFT_W - 32 }}>
                ◆ {m.nom}
              </p>
            </div>
          ))}
        </div>

        {/* Panel droit — timeline SVG */}
        <div style={{ flex: 1, overflowX: 'auto' }}>
          <svg width={Math.max(totalW, 600)} height={svgH} style={{ display: 'block' }}>
            {/* ── Grille verticale mois ── */}
            {months.map((month, i) => {
              const x = Math.max(0, diffDays(minDate, month) * pxPerDay);
              return (
                <g key={i}>
                  <line x1={x} y1={0} x2={x} y2={svgH} stroke="rgba(0,0,0,0.06)" strokeWidth={1} />
                  <text x={x + 6} y={20} fontSize={11} fill="#888780" fontWeight="500">
                    {month.toLocaleDateString('fr-FR', { month: 'short', year: zoom === 'trimestre' ? 'numeric' : undefined })}
                  </text>
                  {zoom === 'semaine' && (
                    <text x={x + 6} y={36} fontSize={10} fill="#BDBCB8">
                      {month.toLocaleDateString('fr-FR', { year: 'numeric' })}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Ligne séparation header */}
            <line x1={0} y1={HEADER_H} x2={totalW} y2={HEADER_H} stroke="rgba(0,0,0,0.08)" strokeWidth={1} />

            {/* Ligne "aujourd'hui" */}
            {todayX >= 0 && todayX <= totalW && (
              <g>
                <line x1={todayX} y1={HEADER_H} x2={todayX} y2={svgH} stroke="#D85A30" strokeWidth={1.5} strokeDasharray="4 3" />
                <text x={todayX + 4} y={HEADER_H + 12} fontSize={10} fill="#D85A30" fontWeight="600">Auj.</text>
              </g>
            )}

            {/* ── Livrables, tâches et sous-tâches (dépliées) ── */}
            {visibleRows.map(({ node, agg, depth }, i) => {
              const y = HEADER_H + i * ROW_H;
              return (
                <g key={node.id} transform={`translate(0, ${y})`}>
                  {/* Bande de ligne */}
                  <rect x={0} y={0} width={totalW} height={ROW_H} fill={i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'} />
                  <GanttBar
                    node={node}
                    agg={agg}
                    minDate={minDate}
                    pxPerDay={pxPerDay}
                    couleur={projet.couleur}
                    tjm={projet.tjm}
                    allNodes={projet.wbs}
                    depth={depth}
                    onHover={(data) => setHovering(data)}
                  />
                </g>
              );
            })}

            {/* ── Jalons ── */}
            {jalons.map((m, i) => {
              const y = HEADER_H + visibleRows.length * ROW_H + (jalons.length > 0 ? 28 : 0) + i * ROW_H;
              if (!m.date_prevue) return null;
              const x = diffDays(minDate, new Date(m.date_prevue)) * pxPerDay;
              const late = new Date(m.date_prevue) < today;
              const size = 8;
              return (
                <g key={m.id}>
                  {/* Background stripe */}
                  <rect x={0} y={y} width={totalW} height={ROW_H} fill={i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)'} />
                  {/* Diamond */}
                  <polygon
                    points={`${x},${y + ROW_H / 2 - size} ${x + size},${y + ROW_H / 2} ${x},${y + ROW_H / 2 + size} ${x - size},${y + ROW_H / 2}`}
                    fill={late ? '#D85A30' : '#1A1A18'}
                    opacity={0.85}
                  />
                  {/* Date label */}
                  <text x={x + size + 4} y={y + ROW_H / 2 + 4} fontSize={11} fill={late ? '#D85A30' : '#5F5E5A'}>
                    {fmtDate(m.date_prevue)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Tooltip */}
      {hovering && (
        <Tooltip
          node={hovering.node}
          agg={hovering.agg}
          budget={hovering.budget}
          couleur={projet.couleur}
          x={hovering.x}
          y={hovering.y}
        />
      )}
    </div>
  );
}

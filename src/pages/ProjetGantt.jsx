import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { calculerBudgetNoeud, formatCurrency } from '../data/calculations';
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

// ── Agrégation niveau 1 ───────────────────────────────────────────
function getLeaves(node, allNodes) {
  const children = allNodes.filter((n) => n.parent_id === node.id);
  if (children.length === 0) return [node];
  return children.flatMap((c) => getLeaves(c, allNodes));
}

function agregerNiveau1(node, allNodes) {
  const leaves = getLeaves(node, allNodes).filter((n) => n.type !== 'jalon');
  if (leaves.length === 0) return {
    date_debut_prev: node.date_debut_prev,
    date_fin_prev:   node.date_fin_prev,
    date_debut_reel: node.date_debut_reel,
    date_fin_reel:   node.date_fin_reel,
    avancement:      node.avancement || 0,
  };

  const prevDebuts = leaves.map((l) => l.date_debut_prev).filter(Boolean).map((d) => new Date(d));
  const prevFins   = leaves.map((l) => l.date_fin_prev).filter(Boolean).map((d) => new Date(d));
  const reelDebuts = leaves.map((l) => l.date_debut_reel).filter(Boolean).map((d) => new Date(d));
  const reelFins   = leaves.map((l) => l.date_fin_reel).filter(Boolean).map((d) => new Date(d));
  const avancemnts = leaves.map((l) => l.avancement || 0);

  return {
    date_debut_prev: prevDebuts.length ? new Date(Math.min(...prevDebuts)).toISOString().slice(0, 10) : null,
    date_fin_prev:   prevFins.length   ? new Date(Math.max(...prevFins)).toISOString().slice(0, 10)   : null,
    date_debut_reel: reelDebuts.length ? new Date(Math.min(...reelDebuts)).toISOString().slice(0, 10) : null,
    date_fin_reel:   reelFins.length   ? new Date(Math.max(...reelFins)).toISOString().slice(0, 10)   : null,
    avancement: Math.round(avancemnts.reduce((s, v) => s + v, 0) / avancemnts.length),
  };
}

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
function GanttBar({ node, agg, minDate, pxPerDay, couleur, tjm, allNodes, onHover }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const budget = calculerBudgetNoeud(node, allNodes, tjm);

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
      {/* Prévisionnelle */}
      {hasPrev && (
        <rect
          x={prevX} y={6} width={prevW} height={16}
          rx={4} fill={couleur} opacity={0.9}
        />
      )}
      {/* Réelle */}
      {hasReel && (
        <>
          <rect
            x={reelX} y={26} width={reelW} height={16}
            rx={4}
            fill={isLate ? '#D85A30' : couleur}
            opacity={0.6}
          />
          {/* Hachures sur barre réelle */}
          <rect
            x={reelX} y={26} width={reelW} height={16}
            rx={4}
            fill={`url(#hatch-${isLate ? 'red' : 'blue'})`}
            opacity={0.3}
          />
          {/* Indicateur avancement */}
          {agg.avancement > 0 && (
            <rect
              x={reelX + reelW * agg.avancement / 100 - 1}
              y={24} width={2} height={20}
              fill={isLate ? '#D85A30' : couleur}
              opacity={0.9}
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

  // Agréger les dates/avancement depuis les enfants
  const tasksWithAgg = useMemo(
    () => racines.map((n) => ({ node: n, agg: agregerNiveau1(n, projet.wbs) })),
    [racines, projet.wbs]
  );

  // Plage temporelle globale
  const { minDate, maxDate, totalDays } = useMemo(() => {
    const allDates = [
      ...tasksWithAgg.flatMap(({ agg }) => [agg.date_debut_prev, agg.date_fin_prev, agg.date_debut_reel, agg.date_fin_reel]),
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
  }, [tasksWithAgg, jalons]);

  const totalW = totalDays * pxPerDay;
  const svgH = HEADER_H + (racines.length + jalons.length) * ROW_H + 20;
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
        subtitle="Niveau 1 — livrables"
        actions={
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
        }
      />

      {/* Légende */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 10, background: projet.couleur, borderRadius: 3, opacity: 0.9 }} />
          <span style={{ fontSize: 12, color: '#5F5E5A' }}>Prévisionnelle</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 28, height: 10, background: projet.couleur, borderRadius: 3, opacity: 0.5, border: '1px dashed currentColor' }} />
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
          {/* Lignes tâches */}
          {tasksWithAgg.map(({ node, agg }) => (
            <div
              key={node.id}
              style={{
                height: ROW_H, display: 'flex', alignItems: 'center', padding: '0 16px',
                borderBottom: '0.5px solid rgba(0,0,0,0.05)',
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#1A1A18', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: LEFT_W - 32 }}>
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
            <defs>
              <pattern id="hatch-blue" patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={8} stroke="#fff" strokeWidth={2} />
              </pattern>
              <pattern id="hatch-red" patternUnits="userSpaceOnUse" width={8} height={8} patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={8} stroke="#fff" strokeWidth={2} />
              </pattern>
            </defs>

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

            {/* ── Tâches niveau 1 ── */}
            {tasksWithAgg.map(({ node, agg }, i) => {
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
                    onHover={(data) => setHovering(data)}
                  />
                </g>
              );
            })}

            {/* ── Jalons ── */}
            {jalons.map((m, i) => {
              const y = HEADER_H + tasksWithAgg.length * ROW_H + (jalons.length > 0 ? 28 : 0) + i * ROW_H;
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

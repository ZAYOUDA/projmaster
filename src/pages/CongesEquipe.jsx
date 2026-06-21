import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import PageHeader from '../components/layout/PageHeader';

const JOURS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const MOIS = ['Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.'];

function toISO(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function startOfWeek(d) { const r = new Date(d); const day = r.getDay(); r.setDate(r.getDate() - (day === 0 ? 6 : day - 1)); return r; }
function getDays(start, n) { return Array.from({ length: n }, (_, i) => addDays(start, i)); }
function isWeekend(d) { const day = d.getDay(); return day === 0 || day === 6; }
function groupByMonth(days) {
  const groups = [];
  days.forEach((d) => {
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (!groups.length || groups.at(-1).key !== key)
      groups.push({ key, label: `${MOIS[d.getMonth()]} ${d.getFullYear()}`, days: [] });
    groups.at(-1).days.push(d);
  });
  return groups;
}

const ZOOM_OPTIONS = [
  { key: '4w', label: '4 sem.', days: 28 },
  { key: '2m', label: '2 mois', days: 62 },
  { key: '3m', label: '3 mois', days: 92 },
];
const COL_WIDTH = 34;
const today = toISO(new Date());

// Cycle de valeur au clic : 0 → 1 → 0.5 → 0
function nextVal(cur) {
  if (!cur || cur === 0) return 1;
  if (cur === 1) return 0.5;
  return 0;
}

export default function CongesEquipe() {
  const allCollabs = useAppStore((s) => s.collaborateurs);
  const collaborateurs = allCollabs.filter((c) => c.actif);
  const setConge = useAppStore((s) => s.setConge);

  const [startDate, setStartDate] = useState(() => startOfWeek(new Date()));
  const [zoom, setZoom] = useState('2m');

  const nbDays = ZOOM_OPTIONS.find((z) => z.key === zoom)?.days || 62;
  const days = getDays(startDate, nbDays);
  const endDate = days.at(-1);
  const monthGroups = groupByMonth(days);

  const nav = (dir) => setStartDate((prev) => addDays(prev, dir * Math.round(nbDays / 2)));

  // Totaux par jour (nb collabs en congé)
  const totalParJour = useMemo(() => {
    const map = {};
    collaborateurs.forEach((c) => {
      Object.entries(c.conges || {}).forEach(([iso, v]) => {
        if (v > 0) map[iso] = (map[iso] || 0) + v;
      });
    });
    return map;
  }, [collaborateurs]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 24px', borderBottom: '0.5px solid rgba(0,0,0,0.1)', flexShrink: 0, background: '#fff' }}>
        <PageHeader title="Congés équipe" subtitle="Cliquez sur une cellule pour saisir 1j / 0,5j / 0" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          {/* Légende */}
          <div style={{ display: 'flex', gap: 10, fontSize: 11, color: '#5F5E5A' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 16, height: 8, background: '#FEE2E2', borderRadius: 2, border: '0.5px solid #FECACA' }} />1j
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 16, height: 8, background: '#FECDD3', borderRadius: 2, border: '0.5px solid #FCA5A5' }} />0,5j
            </span>
          </div>
          {/* Zoom */}
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
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <tr style={{ background: '#EEEDF5' }}>
              <th style={thFixed}>Collaborateur</th>
              {monthGroups.map((g) => (
                <th key={g.key} colSpan={g.days.length} style={{ ...thDay, fontWeight: 700, fontSize: 11, borderLeft: '1px solid rgba(0,0,0,0.15)', background: '#EEEDF5' }}>
                  {g.label}
                </th>
              ))}
            </tr>
            <tr style={{ background: '#F5F4FB' }}>
              <th style={{ ...thFixed, background: '#F5F4FB' }} />
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
            {collaborateurs.map((collab) => (
              <tr key={collab.id} style={{ background: '#fff' }}>
                <td style={{ ...frozenLeft, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: collab.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                      {collab.initiales}
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{collab.prenom} {collab.nom}</div>
                      <div style={{ fontSize: 10, color: '#888780' }}>{collab.profil}</div>
                    </div>
                  </div>
                </td>
                {days.map((d) => {
                  const iso = toISO(d);
                  const wknd = isWeekend(d);
                  const val = (collab.conges || {})[iso] || 0;
                  const bg = wknd ? '#F0EEE8' : val === 1 ? '#FEE2E2' : val === 0.5 ? '#FECDD3' : '#fff';
                  return (
                    <td
                      key={iso}
                      onClick={() => { if (!wknd) setConge(collab.id, iso, nextVal(val)); }}
                      style={{
                        width: COL_WIDTH, minWidth: COL_WIDTH, height: 28,
                        border: '0.5px solid rgba(0,0,0,0.07)',
                        background: bg,
                        textAlign: 'center', verticalAlign: 'middle',
                        cursor: wknd ? 'default' : 'pointer',
                        borderLeft: d.getDay() === 1 ? '1px solid rgba(0,0,0,0.1)' : undefined,
                      }}
                    >
                      {!wknd && val > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#DC2626' }}>
                          {val === 1 ? '1' : '½'}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Ligne total */}
            <tr style={{ background: '#EEEDF5', position: 'sticky', bottom: 0, zIndex: 5 }}>
              <td style={{ ...frozenLeft, background: '#EEEDF5', fontWeight: 700, fontSize: 12 }}>Total / jour</td>
              {days.map((d) => {
                const iso = toISO(d); const wknd = isWeekend(d); const tot = totalParJour[iso] || 0;
                return (
                  <td key={iso} style={{ width: COL_WIDTH, minWidth: COL_WIDTH, border: '0.5px solid rgba(0,0,0,0.1)', background: wknd ? '#EEECE6' : '#EEEDF5', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#DC2626' }}>
                    {tot > 0 ? (tot % 1 === 0 ? tot : tot.toFixed(1)) : ''}
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

const thFixed = { position: 'sticky', left: 0, zIndex: 3, width: 220, minWidth: 220, textAlign: 'left', padding: '6px 12px', fontSize: 11, fontWeight: 600, color: '#5F5E5A', border: '0.5px solid rgba(0,0,0,0.1)', background: '#EEEDF5' };
const thDay = { width: COL_WIDTH, minWidth: COL_WIDTH, textAlign: 'center', padding: '3px 0', fontSize: 10, color: '#5F5E5A', border: '0.5px solid rgba(0,0,0,0.07)' };
const frozenLeft = { position: 'sticky', left: 0, zIndex: 2, width: 220, minWidth: 220, padding: '4px 12px', fontSize: 12, borderRight: '1px solid rgba(0,0,0,0.1)', borderBottom: '0.5px solid rgba(0,0,0,0.07)', whiteSpace: 'nowrap', overflow: 'hidden', height: 36 };
const navBtn = { padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#5F5E5A' };

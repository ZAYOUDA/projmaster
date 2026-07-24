import { useMemo, useRef, useState } from 'react';
import useAppStore from '../store/useAppStore';
import {
  readFileSmart,
  parseCraExport,
  autoMatchConsultants,
  autoMatchMissions,
} from '../utils/craParser';

/**
 * ImportCRA — Import de l'export CRA TM1 (Planning Activité) en 3 étapes :
 *   1. Fichier   : dépôt du CSV, parsing, contrôles de cohérence
 *   2. Mapping   : missions → projets (mapper / créer / ignorer, fusion possible)
 *                  consultants → collaborateurs (auto-match + correction manuelle)
 *   3. Aperçu    : totaux par projet × mois, valeurs éditables, application
 *
 * Le CRA mélange Build et Run : chaque mission peut être rattachée à n'importe
 * quel projet existant, à un nouveau projet (type au choix), ou ignorée.
 */

const C = {
  ink: '#1A1A18',
  grey: '#6B6B68',
  line: '#E8E8E6',
  bg: '#FFFFFF',
  soft: '#F7F7F5',
  warn: '#B45309',
  warnBg: '#FEF3C7',
  ok: '#166534',
  okBg: '#DCFCE7',
  danger: '#B91C1C',
};

const S = {
  page: { padding: '32px 40px', maxWidth: 1100, color: C.ink },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { fontSize: 13, color: C.grey, marginTop: 4 },
  card: { border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginTop: 20, background: C.bg },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.grey, textTransform: 'uppercase', letterSpacing: 0.4, padding: '8px 10px', borderBottom: `1px solid ${C.line}` },
  td: { fontSize: 13, padding: '8px 10px', borderBottom: `1px solid ${C.line}`, verticalAlign: 'middle' },
  select: { fontSize: 13, padding: '5px 8px', border: `1px solid ${C.line}`, borderRadius: 6, background: C.bg, maxWidth: 220 },
  input: { fontSize: 13, padding: '5px 8px', border: `1px solid ${C.line}`, borderRadius: 6, width: 70, textAlign: 'right' },
  btn: { fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: C.ink, color: '#fff' },
  btnGhost: { fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.line}`, cursor: 'pointer', background: C.bg, color: C.ink },
  badge: (bg, fg) => ({ display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: bg, color: fg }),
  stepDot: (active, done) => ({
    width: 26, height: 26, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700,
    background: done ? C.ink : active ? C.ink : C.soft,
    color: done || active ? '#fff' : C.grey,
    border: `1px solid ${done || active ? C.ink : C.line}`,
  }),
};

const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('fr-FR');
const monthLabel = (m) => {
  const [y, mm] = m.split('-');
  const names = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  return `${names[Number(mm) - 1]} ${y}`;
};

export default function ImportCRA() {
  const projets = useAppStore((s) => s.projets ?? s.projects ?? []);
  const collaborateurs = useAppStore((s) => s.collaborateurs ?? s.collabs ?? []);
  const applyCraImport = useAppStore((s) => s.applyCraImport);

  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(null);
  // mapping missions : { mission: { action: 'map'|'create'|'ignore', projetId, newName, newType } }
  const [missionMap, setMissionMap] = useState({});
  // mapping consultants : { craName: collabId | null }
  const [consultantMap, setConsultantMap] = useState({});
  // écrasements manuels de l'aperçu : { `${mission}|${month}|${consultant}`: jours }
  const [overrides, setOverrides] = useState({});
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(null);
  const fileRef = useRef(null);

  /* ---------------------------- Étape 1 : fichier ---------------------------- */

  async function handleFile(file) {
    setError(null);
    try {
      const text = await readFileSmart(file);
      const data = parseCraExport(text);
      if (data.entries.length === 0) {
        throw new Error('Aucune ligne mensuelle détectée dans ce fichier.');
      }
      setParsed(data);
      setFileName(file.name);
      setMissionMap(
        Object.fromEntries(
          data.missions.map((m) => {
            const auto = autoMatchMissions([m], projets)[m];
            return [m, auto
              ? { action: 'map', projetId: auto }
              : { action: 'create', newName: m, newType: 'RUN' }];
          })
        )
      );
      setConsultantMap(autoMatchConsultants(data.consultants, collaborateurs));
      setOverrides({});
      setStep(2);
    } catch (e) {
      setError(e.message);
    }
  }

  /* ---------------------------- Étape 3 : données ---------------------------- */

  // Entrées effectives après mapping + ignorés + overrides
  const effectiveEntries = useMemo(() => {
    if (!parsed) return [];
    return parsed.entries
      .filter((e) => missionMap[e.mission]?.action !== 'ignore')
      .map((e) => {
        const key = `${e.mission}|${e.month}|${e.consultant}`;
        const jours = overrides[key] !== undefined ? overrides[key] : e.jours;
        return { ...e, jours };
      })
      .filter((e) => e.jours > 0);
  }, [parsed, missionMap, overrides]);

  // Agrégat aperçu : cible projet → mois → total
  const preview = useMemo(() => {
    const byTarget = {};
    for (const e of effectiveEntries) {
      const m = missionMap[e.mission];
      const targetKey = m.action === 'map'
        ? `projet:${m.projetId}`
        : `new:${m.newName}`;
      const label = m.action === 'map'
        ? (projets.find((p) => p.id === m.projetId)?.nom
           ?? projets.find((p) => p.id === m.projetId)?.name ?? '?')
        : `${m.newName} (nouveau · ${m.newType})`;
      byTarget[targetKey] = byTarget[targetKey] || { label, months: {}, total: 0, missions: new Set() };
      byTarget[targetKey].months[e.month] = (byTarget[targetKey].months[e.month] || 0) + e.jours;
      byTarget[targetKey].total += e.jours;
      byTarget[targetKey].missions.add(e.mission);
    }
    return byTarget;
  }, [effectiveEntries, missionMap, projets]);

  const unmappedConsultants = useMemo(() => {
    if (!parsed) return [];
    const used = new Set(effectiveEntries.map((e) => e.consultant));
    return parsed.consultants.filter((c) => used.has(c) && !consultantMap[c]);
  }, [parsed, effectiveEntries, consultantMap]);

  /* ---------------------------- Application ---------------------------- */

  async function handleApply() {
    setApplying(true);
    try {
      const payload = effectiveEntries.map((e) => {
        const m = missionMap[e.mission];
        return {
          mission: e.mission,
          month: e.month,
          jours: e.jours,
          collabId: consultantMap[e.consultant],
          consultantName: e.consultant,
          target: m.action === 'map'
            ? { kind: 'existing', projetId: m.projetId }
            : { kind: 'create', nom: m.newName, type: m.newType },
        };
      });
      const summary = await applyCraImport(payload, { source: fileName });
      setDone(summary ?? { entries: payload.length });
      setStep(4);
    } catch (e) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  }

  /* ---------------------------- Rendu ---------------------------- */

  const steps = ['Fichier', 'Mapping', 'Aperçu & import'];

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Import CRA</h1>
      <p style={S.sub}>
        Export TM1 « Planning Activité » (CSV) → jours consommés par projet, collaborateur et mois.
      </p>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
        {steps.map((label, i) => (
          <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={S.stepDot(step === i + 1, step > i + 1)}>{step > i + 1 ? '✓' : i + 1}</div>
            <span style={{ fontSize: 13, fontWeight: step === i + 1 ? 600 : 400, color: step === i + 1 ? C.ink : C.grey }}>
              {label}
            </span>
            {i < steps.length - 1 && <div style={{ width: 32, height: 1, background: C.line }} />}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ ...S.card, borderColor: C.danger, color: C.danger, fontSize: 13 }}>{error}</div>
      )}

      {/* ================= ÉTAPE 1 : FICHIER ================= */}
      {step === 1 && (
        <div
          style={{ ...S.card, textAlign: 'center', padding: 48, cursor: 'pointer', borderStyle: 'dashed' }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
        >
          <div style={{ fontSize: 15, fontWeight: 600 }}>Dépose ton export CRA ici</div>
          <div style={{ fontSize: 13, color: C.grey, marginTop: 6 }}>
            CSV « ; » — encodage Windows ou UTF-8 détecté automatiquement
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
        </div>
      )}

      {/* ================= ÉTAPE 2 : MAPPING ================= */}
      {step === 2 && parsed && (
        <>
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Missions → Projets</div>
              <div style={{ fontSize: 12, color: C.grey }}>
                {fileName} · {parsed.months.length} mois ({monthLabel(parsed.months[0])} → {monthLabel(parsed.months[parsed.months.length - 1])})
              </div>
            </div>
            <p style={{ fontSize: 12.5, color: C.grey, margin: '6px 0 12px' }}>
              Plusieurs missions peuvent pointer vers le même projet (elles seront fusionnées).
              Les missions ignorées ne seront pas importées.
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>Mission CRA</th>
                  <th style={S.th}>Total</th>
                  <th style={S.th}>Action</th>
                  <th style={S.th}>Cible</th>
                </tr>
              </thead>
              <tbody>
                {parsed.missions.map((mission) => {
                  const cfg = missionMap[mission] || {};
                  const total = parsed.entries
                    .filter((e) => e.mission === mission)
                    .reduce((s, e) => s + e.jours, 0);
                  return (
                    <tr key={mission} style={cfg.action === 'ignore' ? { opacity: 0.45 } : undefined}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{mission}</td>
                      <td style={S.td}>{fmt(total)} j</td>
                      <td style={S.td}>
                        <select
                          style={S.select}
                          value={cfg.action}
                          onChange={(e) => setMissionMap((m) => ({
                            ...m,
                            [mission]: e.target.value === 'map'
                              ? { action: 'map', projetId: projets[0]?.id }
                              : e.target.value === 'create'
                                ? { action: 'create', newName: mission, newType: 'RUN' }
                                : { action: 'ignore' },
                          }))}
                        >
                          <option value="map">Projet existant</option>
                          <option value="create">Créer un projet</option>
                          <option value="ignore">Ignorer</option>
                        </select>
                      </td>
                      <td style={S.td}>
                        {cfg.action === 'map' && (
                          <select
                            style={S.select}
                            value={cfg.projetId ?? ''}
                            onChange={(e) => setMissionMap((m) => ({ ...m, [mission]: { ...cfg, projetId: e.target.value } }))}
                          >
                            {projets.map((p) => (
                              <option key={p.id} value={p.id}>{p.nom ?? p.name}</option>
                            ))}
                          </select>
                        )}
                        {cfg.action === 'create' && (
                          <span style={{ display: 'inline-flex', gap: 8 }}>
                            <input
                              style={{ ...S.input, width: 180, textAlign: 'left' }}
                              value={cfg.newName}
                              onChange={(e) => setMissionMap((m) => ({ ...m, [mission]: { ...cfg, newName: e.target.value } }))}
                            />
                            <select
                              style={S.select}
                              value={cfg.newType}
                              onChange={(e) => setMissionMap((m) => ({ ...m, [mission]: { ...cfg, newType: e.target.value } }))}
                            >
                              <option value="RUN">RUN</option>
                              <option value="BUILD">BUILD</option>
                            </select>
                          </span>
                        )}
                        {cfg.action === 'ignore' && <span style={{ fontSize: 12, color: C.grey }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Consultants → Collaborateurs</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>Consultant (CRA)</th>
                  <th style={S.th}>Collaborateur ProjMaster</th>
                  <th style={S.th}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {parsed.consultants
                  .filter((c) => parsed.entries.some((e) => e.consultant === c && missionMap[e.mission]?.action !== 'ignore'))
                  .map((c) => (
                    <tr key={c}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{c}</td>
                      <td style={S.td}>
                        <select
                          style={S.select}
                          value={consultantMap[c] ?? ''}
                          onChange={(e) => setConsultantMap((m) => ({ ...m, [c]: e.target.value || null }))}
                        >
                          <option value="">— à rapprocher —</option>
                          {collaborateurs.map((co) => (
                            <option key={co.id} value={co.id}>
                              {co.nom ?? co.name}{co.trigramme ? ` (${co.trigramme})` : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={S.td}>
                        {consultantMap[c]
                          ? <span style={S.badge(C.okBg, C.ok)}>OK</span>
                          : <span style={S.badge(C.warnBg, C.warn)}>Non rapproché</span>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {parsed.warnings.length > 0 && (
            <div style={{ ...S.card, background: C.warnBg, borderColor: '#FDE68A' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.warn, marginBottom: 6 }}>Contrôles</div>
              {parsed.warnings.map((w, i) => (
                <div key={i} style={{ fontSize: 12.5, color: C.warn }}>• {w}</div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button style={S.btnGhost} onClick={() => { setStep(1); setParsed(null); }}>Changer de fichier</button>
            <button
              style={{ ...S.btn, opacity: unmappedConsultants.length ? 0.5 : 1 }}
              disabled={unmappedConsultants.length > 0}
              title={unmappedConsultants.length ? `À rapprocher : ${unmappedConsultants.join(', ')}` : undefined}
              onClick={() => setStep(3)}
            >
              Voir l'aperçu →
            </button>
          </div>
        </>
      )}

      {/* ================= ÉTAPE 3 : APERÇU ================= */}
      {step === 3 && parsed && (
        <>
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Aperçu de l'import</div>
            <p style={{ fontSize: 12.5, color: C.grey, margin: '0 0 12px' }}>
              Totaux en jours par projet et par mois, toutes ressources confondues.
              Le détail par collaborateur est conservé à l'import.
            </p>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={S.th}>Projet cible</th>
                    {parsed.months.map((m) => <th key={m} style={{ ...S.th, textAlign: 'right' }}>{monthLabel(m)}</th>)}
                    <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(preview).map(([key, t]) => (
                    <tr key={key}>
                      <td style={{ ...S.td, fontWeight: 600 }}>
                        {t.label}
                        {t.missions.size > 1 && (
                          <div style={{ fontSize: 11, color: C.grey, fontWeight: 400 }}>
                            fusion : {[...t.missions].join(' + ')}
                          </div>
                        )}
                      </td>
                      {parsed.months.map((m) => (
                        <td key={m} style={{ ...S.td, textAlign: 'right' }}>
                          {t.months[m] ? fmt(t.months[m]) : <span style={{ color: C.line }}>·</span>}
                        </td>
                      ))}
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{fmt(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 12.5, color: C.grey, marginTop: 10 }}>
              {effectiveEntries.length} lignes (projet × collaborateur × mois) seront importées.
            </div>
          </div>

          {/* Édition fine, repliée par défaut */}
          <details style={{ ...S.card }}>
            <summary style={{ fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
              Modifier des valeurs ligne par ligne
            </summary>
            <div style={{ maxHeight: 320, overflowY: 'auto', marginTop: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Mission</th>
                    <th style={S.th}>Mois</th>
                    <th style={S.th}>Consultant</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Jours</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.entries
                    .filter((e) => missionMap[e.mission]?.action !== 'ignore')
                    .map((e) => {
                      const key = `${e.mission}|${e.month}|${e.consultant}`;
                      const val = overrides[key] !== undefined ? overrides[key] : e.jours;
                      return (
                        <tr key={key}>
                          <td style={S.td}>{e.mission}</td>
                          <td style={S.td}>{monthLabel(e.month)}</td>
                          <td style={S.td}>{e.consultant}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}>
                            <input
                              style={{ ...S.input, ...(overrides[key] !== undefined ? { borderColor: C.warn } : {}) }}
                              type="number"
                              step="0.25"
                              min="0"
                              value={val}
                              onChange={(ev) => setOverrides((o) => ({ ...o, [key]: parseFloat(ev.target.value) || 0 }))}
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </details>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button style={S.btnGhost} onClick={() => setStep(2)}>← Retour au mapping</button>
            <button style={{ ...S.btn, opacity: applying ? 0.6 : 1 }} disabled={applying} onClick={handleApply}>
              {applying ? 'Import en cours…' : `Importer ${effectiveEntries.length} lignes`}
            </button>
          </div>
        </>
      )}

      {/* ================= ÉTAPE 4 : TERMINÉ ================= */}
      {step === 4 && done && (
        <div style={{ ...S.card, background: C.okBg, borderColor: '#BBF7D0' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ok }}>✓ Import terminé</div>
          <div style={{ fontSize: 13, color: C.ok, marginTop: 6 }}>
            {done.entries ?? '—'} lignes importées
            {done.projectsCreated ? ` · ${done.projectsCreated} projet(s) créé(s)` : ''}.
          </div>
          <button style={{ ...S.btnGhost, marginTop: 14 }} onClick={() => { setStep(1); setParsed(null); setDone(null); }}>
            Importer un autre fichier
          </button>
        </div>
      )}
    </div>
  );
}

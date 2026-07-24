import { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import useAppStore from '../store/useAppStore';
import { parseWbsPivot } from '../utils/wbsPivotParser';
import { autoMatchConsultants } from '../utils/craParser';
import { telechargerModeleWbsPivot } from '../utils/wbsPivotTemplate';

/**
 * ImportWbsPage — Import d'un planning complet au format pivot « ProjMaster WBS Import v1.0 ».
 * Voir SPEC-V4-IMPORT-WBS.md. 3 étapes : Fichier → Mapping ressources → Aperçu & options.
 */

const C = {
  ink: '#1A1A18', grey: '#6B6B68', line: '#E8E8E6', bg: '#FFFFFF', soft: '#F7F7F5',
  warn: '#B45309', warnBg: '#FEF3C7', ok: '#166534', okBg: '#DCFCE7', danger: '#B91C1C', dangerBg: '#FEE2E2',
};
const S = {
  page: { padding: '32px 40px', maxWidth: 1000, color: C.ink },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  sub: { fontSize: 13, color: C.grey, marginTop: 4 },
  card: { border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginTop: 20, background: C.bg },
  th: { textAlign: 'left', fontSize: 11, fontWeight: 600, color: C.grey, textTransform: 'uppercase', letterSpacing: 0.4, padding: '8px 10px', borderBottom: `1px solid ${C.line}` },
  td: { fontSize: 13, padding: '8px 10px', borderBottom: `1px solid ${C.line}`, verticalAlign: 'middle' },
  select: { fontSize: 13, padding: '5px 8px', border: `1px solid ${C.line}`, borderRadius: 6, background: C.bg },
  input: { fontSize: 13, padding: '5px 8px', border: `1px solid ${C.line}`, borderRadius: 6 },
  btn: { fontSize: 13, fontWeight: 600, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: C.ink, color: '#fff' },
  btnGhost: { fontSize: 13, fontWeight: 500, padding: '9px 18px', borderRadius: 8, border: `1px solid ${C.line}`, cursor: 'pointer', background: C.bg, color: C.ink },
  stepDot: (active, done) => ({
    width: 26, height: 26, borderRadius: 99, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 700,
    background: done || active ? C.ink : C.soft, color: done || active ? '#fff' : C.grey,
    border: `1px solid ${done || active ? C.ink : C.line}`,
  }),
};

const fmt = (n) => (n ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const fmtE = (n) => `${Math.round(n ?? 0).toLocaleString('fr-FR')} €`;

export default function ImportWbsPage() {
  const { id: projetId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromCreation = searchParams.get('fromCreation') === '1';

  const projet = useAppStore((s) => s.projets.find((p) => p.id === projetId));
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const importWbsPivot = useAppStore((s) => s.importWbsPivot);
  const updateProjet = useAppStore((s) => s.updateProjet);

  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState(null);
  const [error, setError] = useState(null);
  const [mapping, setMapping] = useState({}); // { [code]: { action, collabId?, prenom?, nom? } }
  const [options, setOptions] = useState({
    mode: 'merge', importRealise: true, importDates: true, pinL1: false, applyMeta: fromCreation,
  });
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(null);
  const fileRef = useRef(null);

  /* ---------------------------- Étape 1 : fichier ---------------------------- */

  async function handleFile(file) {
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const data = parseWbsPivot(buf);
      if (data.errors.length > 0) {
        setError(data.errors.join('\n'));
        return;
      }
      if (data.projet.type !== 'BUILD') {
        setError(`Ce fichier décrit un projet de type ${data.projet.type} — l'import de planning WBS ne s'applique qu'aux projets BUILD.`);
        return;
      }
      setParsed(data);
      setFileName(file.name);
      const auto = autoMatchConsultants(data.ressources.map((r) => r.libelle), collaborateurs);
      setMapping(
        Object.fromEntries(data.ressources.map((r) => {
          const matchId = auto[r.libelle];
          const [prenomGuess, ...resteGuess] = r.libelle.split(' ');
          return [r.code, matchId
            ? { action: 'existing', collabId: matchId }
            : { action: 'create', prenom: prenomGuess || r.code, nom: resteGuess.join(' ') || '(import)' }];
        }))
      );
      setStep(2);
    } catch (e) {
      setError(`Fichier illisible : ${e.message}`);
    }
  }

  /* ---------------------------- Étape 3 : aperçu ---------------------------- */

  const l1List = useMemo(() => {
    if (!parsed) return [];
    const map = new Map();
    parsed.wbs.forEach((t) => {
      if (!map.has(t.wbsL1)) map.set(t.wbsL1, { nom: t.wbsL1, l2: new Set(), taches: 0 });
      const e = map.get(t.wbsL1);
      if (t.wbsL2) e.l2.add(t.wbsL2);
      e.taches += 1;
    });
    return [...map.values()];
  }, [parsed]);

  const totaux = useMemo(() => {
    if (!parsed) return null;
    const tjmByCode = Object.fromEntries(parsed.ressources.map((r) => [r.code, r.tjm]));
    let chargePrevue = 0, chargeReelle = 0, cout = 0;
    parsed.wbs.forEach((t) => {
      chargePrevue += t.chargePrevue || 0;
      chargeReelle += t.chargeReelle || 0;
      cout += t.coutPrevu != null ? t.coutPrevu : (t.chargePrevue || 0) * (tjmByCode[t.ressource] || 0);
    });
    return {
      noeudsL1: l1List.length,
      noeudsL2: l1List.reduce((s, e) => s + e.l2.size, 0),
      taches: parsed.wbs.length,
      chargePrevue, chargeReelle, cout,
    };
  }, [parsed, l1List]);

  const nonMappees = useMemo(() => {
    if (!parsed) return [];
    return parsed.ressources.filter((r) => {
      const m = mapping[r.code];
      return m?.action === 'create' && (!m.prenom?.trim() || !m.nom?.trim());
    });
  }, [parsed, mapping]);

  /* ---------------------------- Application ---------------------------- */

  async function handleApply() {
    setApplying(true);
    setError(null);
    try {
      const cleanMapping = Object.fromEntries(
        Object.entries(mapping).map(([code, m]) => [code, m.action === 'existing'
          ? { action: 'existing', collabId: m.collabId }
          : m.action === 'create'
            ? { action: 'create', prenom: m.prenom.trim(), nom: m.nom.trim() }
            : { action: 'ignore' }])
      );
      const summary = await importWbsPivot(projetId, parsed, cleanMapping, options);
      if (options.applyMeta) {
        const statutMap = { en_cours: 'actif', cloture: 'cloture', en_pause: 'en_pause' };
        await updateProjet(projetId, {
          nom: parsed.projet.nom,
          description: parsed.projet.client ? `Client : ${parsed.projet.client}` : (projet.description || ''),
          statut: statutMap[parsed.projet.statut_projet] || 'actif',
          date_debut: parsed.projet.date_debut || projet.date_debut,
        });
      }
      setDone(summary);
      setStep(4);
    } catch (e) {
      setError(e.message);
    } finally {
      setApplying(false);
    }
  }

  if (!projet) return <div style={S.page}>Projet introuvable.</div>;

  const steps = ['Fichier', 'Mapping ressources', 'Aperçu & options'];

  return (
    <div style={S.page}>
      <h1 style={S.h1}>Importer un planning</h1>
      <p style={S.sub}>{projet.nom} — format pivot « ProjMaster WBS Import v1.0 »</p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 20 }}>
        {steps.map((label, i) => (
          <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={S.stepDot(step === i + 1, step > i + 1)}>{step > i + 1 ? '✓' : i + 1}</div>
            <span style={{ fontSize: 13, fontWeight: step === i + 1 ? 600 : 400, color: step === i + 1 ? C.ink : C.grey }}>{label}</span>
            {i < steps.length - 1 && <div style={{ width: 32, height: 1, background: C.line }} />}
          </div>
        ))}
      </div>

      {error && (
        <div style={{ ...S.card, borderColor: C.danger, background: C.dangerBg, color: C.danger, fontSize: 13, whiteSpace: 'pre-line' }}>
          {error}
        </div>
      )}

      {/* ================= ÉTAPE 1 : FICHIER ================= */}
      {step === 1 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              type="button"
              onClick={() => telechargerModeleWbsPivot()}
              style={{ ...S.btnGhost, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Download size={14} /> Télécharger le modèle (.xlsx)
            </button>
          </div>
          <div
            style={{ ...S.card, textAlign: 'center', padding: 48, cursor: 'pointer', borderStyle: 'dashed', marginTop: 12 }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>Dépose le fichier pivot ici</div>
            <div style={{ fontSize: 13, color: C.grey, marginTop: 6 }}>.xlsx — 5 feuilles : PROJET, RESSOURCES, WBS, REALISE_MENSUEL, LISEZMOI</div>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
        </>
      )}

      {/* ================= ÉTAPE 2 : MAPPING ================= */}
      {step === 2 && parsed && (
        <>
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Ressources → Collaborateurs</div>
              <div style={{ fontSize: 12, color: C.grey }}>{fileName} · {parsed.wbs.length} tâches</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>Ressource (fichier)</th>
                  <th style={S.th}>TJM</th>
                  <th style={S.th}>Action</th>
                  <th style={S.th}>Cible</th>
                </tr>
              </thead>
              <tbody>
                {parsed.ressources.map((r) => {
                  const m = mapping[r.code] || { action: 'ignore' };
                  return (
                    <tr key={r.code}>
                      <td style={{ ...S.td, fontWeight: 600 }}>{r.code} — {r.libelle}</td>
                      <td style={S.td}>{r.tjm} €{r.facturable ? '' : ' · non facturable'}</td>
                      <td style={S.td}>
                        <select
                          style={S.select}
                          value={m.action}
                          onChange={(e) => setMapping((mp) => ({
                            ...mp,
                            [r.code]: e.target.value === 'existing'
                              ? { action: 'existing', collabId: collaborateurs[0]?.id }
                              : e.target.value === 'create'
                                ? { action: 'create', prenom: r.libelle, nom: '(import)' }
                                : { action: 'ignore' },
                          }))}
                        >
                          <option value="existing">Collaborateur existant</option>
                          <option value="create">Créer le collaborateur</option>
                          <option value="ignore">Ignorer (pas d'affectation)</option>
                        </select>
                      </td>
                      <td style={S.td}>
                        {m.action === 'existing' && (
                          <select style={S.select} value={m.collabId || ''} onChange={(e) => setMapping((mp) => ({ ...mp, [r.code]: { ...m, collabId: e.target.value } }))}>
                            {collaborateurs.map((c) => <option key={c.id} value={c.id}>{c.prenom} {c.nom}</option>)}
                          </select>
                        )}
                        {m.action === 'create' && (
                          <span style={{ display: 'inline-flex', gap: 6 }}>
                            <input style={{ ...S.input, width: 110 }} placeholder="Prénom" value={m.prenom} onChange={(e) => setMapping((mp) => ({ ...mp, [r.code]: { ...m, prenom: e.target.value } }))} />
                            <input style={{ ...S.input, width: 110 }} placeholder="Nom" value={m.nom} onChange={(e) => setMapping((mp) => ({ ...mp, [r.code]: { ...m, nom: e.target.value } }))} />
                          </span>
                        )}
                        {m.action === 'ignore' && <span style={{ fontSize: 12, color: C.grey }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {parsed.warnings.length > 0 && (
            <div style={{ ...S.card, background: C.warnBg, borderColor: '#FDE68A' }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.warn, marginBottom: 6 }}>Avertissements (non bloquants)</div>
              {parsed.warnings.map((w, i) => <div key={i} style={{ fontSize: 12.5, color: C.warn }}>• {w}</div>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button style={S.btnGhost} onClick={() => { setStep(1); setParsed(null); }}>Changer de fichier</button>
            <button
              style={{ ...S.btn, opacity: nonMappees.length ? 0.5 : 1 }}
              disabled={nonMappees.length > 0}
              title={nonMappees.length ? 'Renseigne prénom et nom pour chaque nouveau collaborateur' : undefined}
              onClick={() => setStep(3)}
            >
              Voir l'aperçu →
            </button>
          </div>
        </>
      )}

      {/* ================= ÉTAPE 3 : APERÇU & OPTIONS ================= */}
      {step === 3 && parsed && totaux && (
        <>
          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Aperçu de l'arbre WBS</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th style={S.th}>Module (L1)</th><th style={{ ...S.th, textAlign: 'right' }}>Sous-catégories (L2)</th><th style={{ ...S.th, textAlign: 'right' }}>Tâches</th></tr>
              </thead>
              <tbody>
                {l1List.map((e) => (
                  <tr key={e.nom}>
                    <td style={S.td}>{e.nom}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{e.l2.size || '—'}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{e.taches}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: 24, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: 11, color: C.grey }}>Nœuds L1 / L2</div><div style={{ fontSize: 16, fontWeight: 700 }}>{totaux.noeudsL1} / {totaux.noeudsL2}</div></div>
              <div><div style={{ fontSize: 11, color: C.grey }}>Tâches</div><div style={{ fontSize: 16, fontWeight: 700 }}>{totaux.taches}</div></div>
              <div><div style={{ fontSize: 11, color: C.grey }}>Charge prévue</div><div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(totaux.chargePrevue)} j</div></div>
              <div><div style={{ fontSize: 11, color: C.grey }}>Charge réalisée</div><div style={{ fontSize: 16, fontWeight: 700 }}>{fmt(totaux.chargeReelle)} j</div></div>
              <div><div style={{ fontSize: 11, color: C.grey }}>Coût prévu</div><div style={{ fontSize: 16, fontWeight: 700 }}>{fmtE(totaux.cout)}</div></div>
            </div>
          </div>

          <div style={S.card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Options d'import</div>
            {(projet.wbs || []).length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
                <input type="radio" name="mode" checked={options.mode === 'merge'} onChange={() => setOptions((o) => ({ ...o, mode: 'merge' }))} />
                Fusionner (ajouter sous les nœuds existants de même nom, créer sinon)
              </label>
            )}
            {(projet.wbs || []).length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13, color: C.danger }}>
                <input type="radio" name="mode" checked={options.mode === 'replace'} onChange={() => setOptions((o) => ({ ...o, mode: 'replace' }))} />
                Remplacer — purge le WBS existant ({projet.wbs.length} nœuds) avant import
              </label>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
              <input type="checkbox" checked={options.importRealise} onChange={(e) => setOptions((o) => ({ ...o, importRealise: e.target.checked }))} />
              Importer le réalisé mensuel
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
              <input type="checkbox" checked={options.importDates} onChange={(e) => setOptions((o) => ({ ...o, importDates: e.target.checked }))} />
              Importer les dates prévues/réelles
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}>
              <input type="checkbox" checked={options.pinL1} onChange={(e) => setOptions((o) => ({ ...o, pinL1: e.target.checked }))} />
              Épingler les nœuds L1 comme livrables sur le dashboard
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={options.applyMeta} onChange={(e) => setOptions((o) => ({ ...o, applyMeta: e.target.checked }))} />
              Mettre à jour nom / statut / date de début du projet depuis le fichier (recommandé pour un chargement historique)
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
            <button style={S.btnGhost} onClick={() => setStep(2)}>← Retour au mapping</button>
            <button style={{ ...S.btn, opacity: applying ? 0.6 : 1 }} disabled={applying} onClick={handleApply}>
              {applying ? 'Import en cours…' : `Importer ${totaux.taches} tâches`}
            </button>
          </div>
        </>
      )}

      {/* ================= ÉTAPE 4 : TERMINÉ ================= */}
      {step === 4 && done && (
        <div style={{ ...S.card, background: C.okBg, borderColor: '#BBF7D0' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.ok }}>✓ Import terminé</div>
          <div style={{ fontSize: 13, color: C.ok, marginTop: 6 }}>
            {done.noeudsL1} nœud(s) L1 · {done.noeudsL2} nœud(s) L2 · {done.taches} tâche(s) · {fmt(done.joursRealises)} j réalisés importés.
          </div>
          <button style={{ ...S.btnGhost, marginTop: 14 }} onClick={() => navigate(`/projet/${projetId}/wbs`)}>
            Aller au WBS
          </button>
        </div>
      )}
    </div>
  );
}

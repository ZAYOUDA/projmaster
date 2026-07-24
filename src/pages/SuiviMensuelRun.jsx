import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import useAppStore from '../store/useAppStore';

/**
 * SuiviMensuelRun — Écran de pilotage d'un projet RUN (TMA / régie à enveloppe).
 *
 * Reproduit la logique du suivi Excel (DT-xxx-Facturation) :
 *   - Blocs par bon de commande (n° Cmd + lot éventuel)
 *   - Lignes = commande × collaborateur, avec PU et NBJ commandé
 *   - Colonnes = mois : saisie du consommé (NBJ), HT et Reste calculés
 *   - Totaux par commande et bandeau KPI projet (burn rate, projection)
 *   - Mois verrouillés dès que la facture est émise
 *   - Panneau « Non affecté » : conso importée du CRA à rattacher à une ligne
 */

const C = {
  ink: '#1A1A18', grey: '#6B6B68', line: '#E8E8E6', soft: '#F7F7F5',
  warn: '#B45309', warnBg: '#FEF3C7', ok: '#166534', okBg: '#DCFCE7',
  danger: '#B91C1C', dangerBg: '#FEE2E2',
};

const S = {
  page: { padding: '32px 40px', color: C.ink },
  h1: { fontSize: 22, fontWeight: 700, margin: 0 },
  kpis: { display: 'flex', gap: 12, marginTop: 20, flexWrap: 'wrap' },
  kpi: { border: `1px solid ${C.line}`, borderRadius: 10, padding: '12px 18px', minWidth: 150 },
  kpiLabel: { fontSize: 11, fontWeight: 600, color: C.grey, textTransform: 'uppercase', letterSpacing: 0.4 },
  kpiValue: { fontSize: 20, fontWeight: 700, marginTop: 4 },
  kpiSub: { fontSize: 11.5, color: C.grey, marginTop: 2 },
  block: { border: `1px solid ${C.line}`, borderRadius: 10, marginTop: 20, overflow: 'hidden' },
  blockHead: { padding: '12px 16px', background: C.soft, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  th: { textAlign: 'right', fontSize: 11, fontWeight: 600, color: C.grey, padding: '8px 10px', borderBottom: `1px solid ${C.line}`, whiteSpace: 'nowrap' },
  thL: { textAlign: 'left' },
  td: { fontSize: 13, padding: '6px 10px', borderBottom: `1px solid ${C.line}`, textAlign: 'right', whiteSpace: 'nowrap' },
  tdL: { textAlign: 'left' },
  input: { width: 58, fontSize: 13, padding: '4px 6px', border: `1px solid ${C.line}`, borderRadius: 6, textAlign: 'right', background: '#fff' },
  totalRow: { fontWeight: 700, background: C.soft },
  btn: { fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: C.ink, color: '#fff' },
};

const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const fmt = (n, d = 2) => (n ?? 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });
const fmtE = (n) => `${fmt(n, 0)} €`;

export default function SuiviMensuelRun() {
  const { id: projetId } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === projetId));
  const collaborateurs = useAppStore((s) => s.collaborateurs);
  const setConso = useAppStore((s) => s.setConsoMensuelleRun);
  const genererFacture = useAppStore((s) => s.genererFactureRunMois);
  const affecterConso = useAppStore((s) => s.affecterConsoNonAffectee);

  const annee = new Date().getFullYear();
  const [anneeVue, setAnneeVue] = useState(annee);
  const [error, setError] = useState('');
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => `${anneeVue}-${String(i + 1).padStart(2, '0')}`),
    [anneeVue]
  );

  const collabName = (id) => {
    const c = collaborateurs.find((x) => x.id === id);
    return c ? `${c.prenom} ${c.nom}` : '?';
  };

  const commandes = useMemo(
    () => (projet?.commandes ?? []).filter((c) => c.annee === anneeVue),
    [projet, anneeVue]
  );
  const conso = projet?.consoMensuelle ?? {};
  const nonAffectee = projet?.consoNonAffectee ?? {};
  const locked = new Set(projet?.moisVerrouilles ?? []);

  /* ------------------------------ Calculs ------------------------------ */

  const calc = useMemo(() => {
    const parLigne = {};   // ligneId -> { consoTotale, htConso, reste }
    let cmdNbj = 0, cmdHt = 0, consoNbj = 0, consoHt = 0;

    for (const cmd of commandes) {
      for (const l of cmd.lignes) {
        const totalLigne = months.reduce((s, m) => s + (conso[m]?.[l.id] || 0), 0);
        const ht = totalLigne * l.pu;
        parLigne[l.id] = {
          consoTotale: totalLigne,
          htConso: ht,
          reste: l.nbjCommande != null ? l.nbjCommande - totalLigne : null,
        };
        cmdNbj += l.nbjCommande || 0;
        cmdHt += (l.nbjCommande || 0) * l.pu;
        consoNbj += totalLigne;
        consoHt += ht;
      }
    }

    // Burn rate : moyenne des mois écoulés avec conso > 0 → mois d'épuisement projeté
    const now = new Date();
    const currentMonthIdx = anneeVue === now.getFullYear() ? now.getMonth() + 1 : 12;
    const elapsed = months.slice(0, currentMonthIdx);
    const activeMonths = elapsed.filter((m) => Object.values(conso[m] ?? {}).some((v) => v > 0));
    const burn = activeMonths.length ? consoNbj / activeMonths.length : 0;
    const reste = cmdNbj - consoNbj;
    const moisRestants = burn > 0 ? reste / burn : Infinity;
    const epuisementIdx = currentMonthIdx + moisRestants; // index 1-12+
    const projection = !Number.isFinite(moisRestants)
      ? null
      : epuisementIdx > 12
        ? { ok: true, label: `au-delà de déc. ${anneeVue}` }
        : { ok: false, label: `~ ${MONTH_SHORT[Math.min(11, Math.floor(epuisementIdx) - 1)]} ${anneeVue}` };

    return { parLigne, cmdNbj, cmdHt, consoNbj, consoHt, reste, resteHt: cmdHt - consoHt, burn, projection };
  }, [commandes, conso, months, anneeVue]);

  const factureMoisCourant = useMemo(() => {
    const m = months[new Date().getMonth()];
    let ht = 0;
    for (const cmd of commandes) for (const l of cmd.lignes) ht += (conso[m]?.[l.id] || 0) * l.pu;
    return { month: m, ht };
  }, [commandes, conso, months]);

  if (!projet) return <div style={S.page}>Projet introuvable.</div>;
  if (projet.type !== 'RUN') return <div style={S.page}>Ce projet n'est pas de type RUN.</div>;

  const handleGenererFacture = async () => {
    setError('');
    try {
      await genererFacture(projet.id, factureMoisCourant.month);
    } catch (e) {
      setError(e.message);
    }
  };

  const handleSetConso = async (ligneId, month, value) => {
    setError('');
    try {
      await setConso(projet.id, month, ligneId, value);
    } catch (e) {
      setError(e.message);
    }
  };

  /* ------------------------------ Rendu ------------------------------ */

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h1 style={S.h1}>{projet.nom} · Suivi mensuel</h1>
          <div style={{ fontSize: 13, color: C.grey, marginTop: 4 }}>
            Contrats {anneeVue} — saisie du consommé en jours, HT et restes calculés
          </div>
        </div>
        <select
          style={{ fontSize: 13, padding: '6px 10px', border: `1px solid ${C.line}`, borderRadius: 8 }}
          value={anneeVue}
          onChange={(e) => setAnneeVue(Number(e.target.value))}
        >
          {[annee - 1, annee, annee + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {error && (
        <div style={{ border: `1px solid ${C.danger}`, background: C.dangerBg, color: C.danger, borderRadius: 10, padding: '10px 14px', marginTop: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* KPIs */}
      <div style={S.kpis}>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Commandé</div>
          <div style={S.kpiValue}>{fmt(calc.cmdNbj)} j</div>
          <div style={S.kpiSub}>{fmtE(calc.cmdHt)}</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Consommé YTD</div>
          <div style={S.kpiValue}>{fmt(calc.consoNbj)} j</div>
          <div style={S.kpiSub}>{fmtE(calc.consoHt)} · {calc.cmdNbj ? Math.round((calc.consoNbj / calc.cmdNbj) * 100) : 0} %</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Reste</div>
          <div style={{ ...S.kpiValue, color: calc.reste < 10 ? C.danger : C.ink }}>{fmt(calc.reste)} j</div>
          <div style={S.kpiSub}>{fmtE(calc.resteHt)}</div>
        </div>
        <div style={S.kpi}>
          <div style={S.kpiLabel}>Rythme</div>
          <div style={S.kpiValue}>{fmt(calc.burn, 1)} j/mois</div>
          {calc.projection && (
            <div style={{ ...S.kpiSub, color: calc.projection.ok ? C.ok : C.warn, fontWeight: 600 }}>
              épuisement {calc.projection.label}
            </div>
          )}
        </div>
        <div style={{ ...S.kpi, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={S.kpiLabel}>Facturable · {MONTH_SHORT[new Date().getMonth()]}</div>
            <div style={S.kpiValue}>{fmtE(factureMoisCourant.ht)}</div>
          </div>
          <button
            style={{ ...S.btn, marginTop: 8, opacity: locked.has(factureMoisCourant.month) || factureMoisCourant.ht === 0 ? 0.45 : 1 }}
            disabled={locked.has(factureMoisCourant.month) || factureMoisCourant.ht === 0}
            onClick={handleGenererFacture}
          >
            {locked.has(factureMoisCourant.month) ? 'Facture émise' : 'Générer la facture'}
          </button>
        </div>
      </div>

      {/* Conso importée non affectée */}
      {Object.keys(nonAffectee).length > 0 && (
        <div style={{ border: `1px solid #FDE68A`, background: C.warnBg, borderRadius: 10, padding: 16, marginTop: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: C.warn }}>
            Consommation importée à rattacher à une ligne de commande
          </div>
          {Object.entries(nonAffectee).map(([m, byCollab]) =>
            Object.entries(byCollab).map(([collabId, nbj]) => {
              const lignesPossibles = commandes.flatMap((cmd) =>
                cmd.lignes.filter((l) => l.collabId === collabId).map((l) => ({ ...l, cmdLabel: cmd.numero + (cmd.lot ? ` · ${cmd.lot}` : '') }))
              );
              return (
                <div key={`${m}-${collabId}`} style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, fontSize: 13, color: C.warn }}>
                  <span style={{ minWidth: 260 }}>
                    {MONTH_SHORT[Number(m.split('-')[1]) - 1]} · {collabName(collabId)} · <b>{fmt(nbj)} j</b>
                  </span>
                  <select
                    style={{ fontSize: 12.5, padding: '4px 8px', border: `1px solid #FDE68A`, borderRadius: 6 }}
                    defaultValue=""
                    onChange={(e) => e.target.value && affecterConso(projet.id, m, collabId, e.target.value)}
                  >
                    <option value="">Choisir la ligne de commande…</option>
                    {lignesPossibles.map((l) => (
                      <option key={l.id} value={l.id}>{l.cmdLabel} — PU {fmt(l.pu, 0)} €</option>
                    ))}
                  </select>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Blocs commandes */}
      {commandes.length === 0 && (
        <div style={{ ...S.block, padding: 32, textAlign: 'center', color: C.grey, fontSize: 13.5 }}>
          Aucun bon de commande pour {anneeVue}. Ajoute-en un dans Paramètres → Bons de commande.
        </div>
      )}
      {commandes.map((cmd) => {
        const totCmd = cmd.lignes.reduce((s, l) => s + (l.nbjCommande || 0), 0);
        const totHt = cmd.lignes.reduce((s, l) => s + (l.nbjCommande || 0) * l.pu, 0);
        return (
          <div key={cmd.id} style={S.block}>
            <div style={S.blockHead}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {cmd.numero}{cmd.lot ? <span style={{ color: C.grey, fontWeight: 500 }}> · {cmd.lot}</span> : null}
              </div>
              <div style={{ fontSize: 12.5, color: C.grey }}>
                Commandé : <b style={{ color: C.ink }}>{fmt(totCmd)} j</b> · {fmtE(totHt)}
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={{ ...S.th, ...S.thL, position: 'sticky', left: 0, background: '#fff' }}>Collaborateur</th>
                    <th style={S.th}>PU</th>
                    <th style={S.th}>NBJ cmd</th>
                    {months.map((m, i) => (
                      <th key={m} style={{ ...S.th, background: locked.has(m) ? C.soft : undefined }}>
                        {MONTH_SHORT[i]}{locked.has(m) ? ' 🔒' : ''}
                      </th>
                    ))}
                    <th style={S.th}>Consommé</th>
                    <th style={S.th}>Reste</th>
                    <th style={S.th}>Reste HT</th>
                  </tr>
                </thead>
                <tbody>
                  {cmd.lignes.map((l) => {
                    const k = calc.parLigne[l.id] ?? {};
                    return (
                      <tr key={l.id}>
                        <td style={{ ...S.td, ...S.tdL, fontWeight: 600, position: 'sticky', left: 0, background: '#fff' }}>
                          {collabName(l.collabId)}
                        </td>
                        <td style={S.td}>{fmt(l.pu, 0)} €</td>
                        <td style={S.td}>{l.nbjCommande != null ? fmt(l.nbjCommande) : '—'}</td>
                        {months.map((m) => (
                          <td key={m} style={{ ...S.td, background: locked.has(m) ? C.soft : undefined }}>
                            <input
                              style={{ ...S.input, ...(locked.has(m) ? { background: 'transparent', border: 'none' } : {}) }}
                              type="number" step="0.25" min="0"
                              disabled={locked.has(m)}
                              value={conso[m]?.[l.id] ?? ''}
                              placeholder="·"
                              onChange={(e) => handleSetConso(l.id, m, parseFloat(e.target.value) || 0)}
                            />
                          </td>
                        ))}
                        <td style={{ ...S.td, fontWeight: 600 }}>{fmt(k.consoTotale)}</td>
                        <td style={{ ...S.td, fontWeight: 700, color: k.reste != null && k.reste < 5 ? C.danger : C.ink }}>
                          {k.reste != null ? fmt(k.reste) : '—'}
                        </td>
                        <td style={S.td}>{k.reste != null ? fmtE(k.reste * l.pu) : '—'}</td>
                      </tr>
                    );
                  })}
                  {/* Total commande */}
                  <tr style={S.totalRow}>
                    <td style={{ ...S.td, ...S.tdL, position: 'sticky', left: 0, background: C.soft }}>Total</td>
                    <td style={S.td} />
                    <td style={S.td}>{fmt(totCmd)}</td>
                    {months.map((m) => {
                      const t = cmd.lignes.reduce((s, l) => s + (conso[m]?.[l.id] || 0), 0);
                      return <td key={m} style={S.td}>{t ? fmt(t) : ''}</td>;
                    })}
                    <td style={S.td}>{fmt(cmd.lignes.reduce((s, l) => s + (calc.parLigne[l.id]?.consoTotale || 0), 0))}</td>
                    <td style={S.td}>
                      {fmt(cmd.lignes.reduce((s, l) => s + (calc.parLigne[l.id]?.reste ?? 0), 0))}
                    </td>
                    <td style={S.td}>
                      {fmtE(cmd.lignes.reduce((s, l) => s + (calc.parLigne[l.id]?.reste ?? 0) * l.pu, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

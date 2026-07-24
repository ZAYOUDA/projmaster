import * as XLSX from 'xlsx';

/**
 * wbsPivotParser.js — Parseur du format pivot « ProjMaster WBS Import v1.0 » (5 feuilles xlsx).
 * Voir SPEC-V4-IMPORT-WBS.md §1 pour le contrat d'interface complet.
 */

const REQUIRED_SHEETS = ['PROJET', 'RESSOURCES', 'WBS', 'REALISE_MENSUEL'];
const STATUTS_VALIDES = ['a_faire', 'en_cours', 'termine', 'bloque'];
const STATUTS_PROJET_VALIDES = ['en_cours', 'cloture', 'en_pause'];

function toIsoDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function toNumberOrNull(v) {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const EMPTY_RESULT = { errors: [], warnings: [], projet: null, ressources: [], wbs: [], realiseMensuel: [] };

/**
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ errors: string[], warnings: string[], projet: object|null, ressources: object[], wbs: object[], realiseMensuel: object[] }}
 */
export function parseWbsPivot(arrayBuffer) {
  const errors = [];
  const warnings = [];

  let wb;
  try {
    wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
  } catch (e) {
    return { ...EMPTY_RESULT, errors: [`Fichier illisible : ${e.message}`] };
  }

  for (const name of REQUIRED_SHEETS) {
    if (!wb.SheetNames.includes(name)) errors.push(`Feuille "${name}" manquante.`);
  }
  if (errors.length) return { ...EMPTY_RESULT, errors };

  // ── PROJET ────────────────────────────────────────────────────────
  const projetRows = XLSX.utils.sheet_to_json(wb.Sheets['PROJET'], { defval: '' });
  const projet = {};
  projetRows.forEach((r) => { if (r.Cle) projet[String(r.Cle).trim()] = r.Valeur; });

  if (!projet.format_version || !/^1(\.\d+)?$/.test(String(projet.format_version))) {
    errors.push(`PROJET.format_version "${projet.format_version || ''}" non supporté (attendu 1.x).`);
  }
  if (!projet.nom) errors.push('PROJET.nom est obligatoire.');
  if (!['BUILD', 'RUN'].includes(projet.type)) {
    errors.push(`PROJET.type invalide : "${projet.type}" (attendu BUILD ou RUN).`);
  }
  if (projet.statut_projet && !STATUTS_PROJET_VALIDES.includes(projet.statut_projet)) {
    errors.push(`PROJET.statut_projet invalide : "${projet.statut_projet}".`);
  }
  projet.date_debut = toIsoDate(projet.date_debut);
  projet.devise = projet.devise || 'EUR';
  projet.statut_projet = projet.statut_projet || 'en_cours';

  // ── RESSOURCES ────────────────────────────────────────────────────
  const ressourcesRaw = XLSX.utils.sheet_to_json(wb.Sheets['RESSOURCES'], { defval: '' })
    .filter((r) => r.Code !== '' || r.Libelle !== '');
  const ressources = ressourcesRaw.map((r, i) => {
    const code = String(r.Code || '').trim();
    if (!code) errors.push(`RESSOURCES ligne ${i + 2} : Code manquant.`);
    return {
      code,
      libelle: String(r.Libelle || '').trim(),
      profil: String(r.Profil || '').trim(),
      tjm: toNumberOrNull(r.TJM_EUR) ?? 0,
      facturable: String(r.Facturable || '').trim().toUpperCase() === 'OUI',
    };
  });
  const codesDupliques = ressources.map((r) => r.code).filter((c, i, arr) => c && arr.indexOf(c) !== i);
  [...new Set(codesDupliques)].forEach((c) => errors.push(`RESSOURCES : Code "${c}" en doublon.`));
  const ressourceCodes = new Set(ressources.map((r) => r.code));

  // ── WBS ───────────────────────────────────────────────────────────
  const wbsRaw = XLSX.utils.sheet_to_json(wb.Sheets['WBS'], { defval: '' })
    .filter((r) => r.ID !== '' || r.Tache !== '');
  const seenIds = new Set();
  const wbs = wbsRaw.map((r, i) => {
    const ligne = i + 2;
    const id = String(r.ID || '').trim();
    if (!id) errors.push(`WBS ligne ${ligne} : ID manquant.`);
    else if (seenIds.has(id)) errors.push(`WBS ligne ${ligne} : ID "${id}" en doublon.`);
    seenIds.add(id);
    if (!r.WBS_L1) errors.push(`WBS ligne ${ligne} (${id || '?'}) : WBS_L1 manquant.`);
    if (!r.Tache) errors.push(`WBS ligne ${ligne} (${id || '?'}) : Tache manquante.`);
    if (!STATUTS_VALIDES.includes(r.Statut)) {
      errors.push(`WBS ligne ${ligne} (${id || '?'}) : Statut invalide "${r.Statut}".`);
    }
    const ressource = r.Ressource ? String(r.Ressource).trim() : null;
    if (ressource && !ressourceCodes.has(ressource)) {
      errors.push(`WBS ligne ${ligne} (${id || '?'}) : Ressource "${ressource}" absente de RESSOURCES.`);
    }
    return {
      id,
      wbsL1: String(r.WBS_L1 || '').trim(),
      wbsL2: String(r.WBS_L2 || '').trim() || null,
      tache: String(r.Tache || '').trim(),
      commentaire: String(r.Commentaire || '').trim() || null,
      ressource,
      statut: r.Statut,
      chargePrevue: toNumberOrNull(r.Charge_Prevue_j),
      chargePlanifiee: toNumberOrNull(r.Charge_Planifiee_j),
      chargeReelle: toNumberOrNull(r.Charge_Reelle_j),
      coutPrevu: toNumberOrNull(r.Cout_Prevu_EUR),
      debutPrev: toIsoDate(r.Debut_Prev),
      finPrev: toIsoDate(r.Fin_Prev),
      debutReel: toIsoDate(r.Debut_Reel),
      finReel: toIsoDate(r.Fin_Reel),
      prerequis: r.Prerequis ? String(r.Prerequis).trim() : null,
    };
  });
  const wbsIds = new Set(wbs.map((t) => t.id));

  // ── REALISE_MENSUEL ───────────────────────────────────────────────
  const realiseRaw = XLSX.utils.sheet_to_json(wb.Sheets['REALISE_MENSUEL'], { defval: '' })
    .filter((r) => r.ID_Tache !== '' || r.Mois !== '');
  const realiseMensuel = realiseRaw.map((r, i) => {
    const ligne = i + 2;
    const idTache = String(r.ID_Tache || '').trim();
    if (!wbsIds.has(idTache)) errors.push(`REALISE_MENSUEL ligne ${ligne} : ID_Tache "${idTache}" introuvable dans WBS.`);
    const mois = String(r.Mois || '').trim();
    if (!/^\d{4}-\d{2}$/.test(mois)) errors.push(`REALISE_MENSUEL ligne ${ligne} : Mois "${r.Mois}" invalide (attendu AAAA-MM).`);
    const jours = toNumberOrNull(r.Jours);
    if (jours == null || jours <= 0) errors.push(`REALISE_MENSUEL ligne ${ligne} : Jours doit être > 0.`);
    return { idTache, mois, jours: jours || 0 };
  });

  // Invariant §1.5 : Σ REALISE_MENSUEL.Jours = WBS.Charge_Reelle_j (tolérance 0,01) → avertissement non bloquant
  if (errors.length === 0) {
    const sommeParTache = {};
    realiseMensuel.forEach((r) => { sommeParTache[r.idTache] = (sommeParTache[r.idTache] || 0) + r.jours; });
    wbs.forEach((t) => {
      const somme = sommeParTache[t.id] || 0;
      const declare = t.chargeReelle || 0;
      if (Math.abs(somme - declare) > 0.01) {
        warnings.push(`${t.id} (${t.tache}) : réalisé mensuel = ${somme.toFixed(3)} j ≠ Charge_Reelle_j = ${declare} j.`);
      }
    });
  }

  return { errors, warnings, projet: errors.length ? null : projet, ressources, wbs, realiseMensuel };
}

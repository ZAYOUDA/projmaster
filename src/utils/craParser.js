/**
 * craParser.js — Parseur d'export CRA (cube TM1 "Datatilt - Planning Equipe")
 *
 * Format attendu (CSV ';', encodage Windows-1252/Latin-1 ou UTF-8) :
 *   - Lignes d'en-tête cube (CUBE / Scenario / Indicateur / Sandboxes)
 *   - Ligne d'en-têtes colonnes :  Jour | Mission | <Consultant 1> | ... | Total Consultant
 *   - Lignes de données :
 *       "2026"            → total annuel par mission (utilisé comme contrôle uniquement)
 *       "2026 - janvier"  → détail mensuel par mission
 *
 * Sortie : objet structuré { meta, consultants, missions, entries, annualTotals, warnings }
 *   entries = [{ mission, month: '2026-01', consultant, jours }]  (jours > 0 uniquement)
 */

const FRENCH_MONTHS = {
  janvier: 1, fevrier: 2, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, août: 8, septembre: 9, octobre: 10, novembre: 11,
  decembre: 12, décembre: 12,
};

/** "1 234,56" | "1 234,56" (nbsp) | "-" | "" → number */
export function parseFrNumber(raw) {
  if (raw == null) return 0;
  const s = String(raw).replace(/[\s\u00A0\u202F]/g, '').replace(',', '.').trim();
  if (s === '' || s === '-') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Lit un File en texte. Essaie UTF-8, retombe sur windows-1252 si caractères invalides (é → �). */
export async function readFileSmart(file) {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (utf8.includes('\uFFFD')) {
    return new TextDecoder('windows-1252').decode(buf);
  }
  return utf8;
}

/** Split CSV minimaliste : séparateur ';', gestion des guillemets doubles. */
function splitCsvLine(line, sep = ';') {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === sep && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

/** "2026 - janvier" → "2026-01" ; "2026" → { annual: 2026 } ; sinon null */
function parsePeriod(raw) {
  const s = String(raw || '').trim().toLowerCase();
  const annual = s.match(/^(\d{4})$/);
  if (annual) return { type: 'annual', year: Number(annual[1]) };
  const monthly = s.match(/^(\d{4})\s*-\s*([a-zàâéèêîôûç]+)$/i);
  if (monthly) {
    const m = FRENCH_MONTHS[monthly[2]];
    if (m) return { type: 'monthly', month: `${monthly[1]}-${String(m).padStart(2, '0')}` };
  }
  return null;
}

/**
 * Parse le texte complet de l'export.
 * @param {string} text
 * @returns {{ meta, consultants: string[], missions: string[], entries: Array, annualTotals: Object, warnings: string[] }}
 */
export function parseCraExport(text) {
  const warnings = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = lines.map((l) => splitCsvLine(l));

  // Métadonnées cube (facultatives)
  const meta = {};
  for (const r of rows.slice(0, 8)) {
    const key = (r[0] || '').toLowerCase();
    if (key === 'cube') meta.cube = r[1];
    if (key === 'scenario') meta.scenario = r[1];
    if (key.startsWith('indicateur')) meta.indicateur = r[1];
  }

  // Ligne d'en-têtes : Jour | Mission | consultants... | Total Consultant
  const headerIdx = rows.findIndex(
    (r) => (r[0] || '').toLowerCase() === 'jour' && (r[1] || '').toLowerCase() === 'mission'
  );
  if (headerIdx === -1) {
    throw new Error(
      "Format non reconnu : ligne d'en-têtes « Jour;Mission;... » introuvable. " +
      "Vérifie que le fichier est bien l'export TM1 Planning Activité."
    );
  }
  const header = rows[headerIdx];
  const totalColIdx = header.findIndex((h) => /^total/i.test(h));
  const lastConsultantCol = totalColIdx === -1 ? header.length : totalColIdx;
  const consultants = header.slice(2, lastConsultantCol).filter(Boolean);

  const entries = [];
  const annualTotals = {}; // { mission: { consultant: jours, __total } }
  const missionsSet = new Set();

  for (const r of rows.slice(headerIdx + 1)) {
    const period = parsePeriod(r[0]);
    const mission = (r[1] || '').trim();
    if (!period || !mission) continue;
    missionsSet.add(mission);

    consultants.forEach((consultant, ci) => {
      const jours = parseFrNumber(r[2 + ci]);
      if (jours === 0) return;
      if (period.type === 'annual') {
        annualTotals[mission] = annualTotals[mission] || {};
        annualTotals[mission][consultant] = jours;
      } else {
        entries.push({ mission, month: period.month, consultant, jours });
      }
    });
    if (period.type === 'annual' && totalColIdx !== -1) {
      annualTotals[mission] = annualTotals[mission] || {};
      annualTotals[mission].__total = parseFrNumber(r[totalColIdx]);
    }
  }

  // Contrôle de cohérence : somme mensuelle vs total annuel par mission×consultant
  const sums = {};
  for (const e of entries) {
    sums[e.mission] = sums[e.mission] || {};
    sums[e.mission][e.consultant] = (sums[e.mission][e.consultant] || 0) + e.jours;
  }
  for (const [mission, byConsultant] of Object.entries(annualTotals)) {
    for (const [consultant, total] of Object.entries(byConsultant)) {
      if (consultant === '__total') continue;
      const sum = sums[mission]?.[consultant] || 0;
      if (Math.abs(sum - total) > 0.01) {
        warnings.push(
          `${mission} / ${consultant} : total annuel ${total} j ≠ somme mensuelle ${sum.toFixed(2)} j ` +
          `(l'export ne couvre peut-être pas tous les mois — l'import utilisera le détail mensuel).`
        );
      }
    }
  }

  const months = [...new Set(entries.map((e) => e.month))].sort();
  return {
    meta,
    consultants,
    missions: [...missionsSet],
    months,
    entries,
    annualTotals,
    warnings,
  };
}

/* ------------------------------------------------------------------ */
/*  Aide au rapprochement consultants CRA ↔ collaborateurs ProjMaster  */
/* ------------------------------------------------------------------ */

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Auto-matching consultant → collaborateur.
 * Match si tous les tokens du plus court sont inclus dans le plus long
 * ("Zied BEN HMIDA" ↔ "Zied Ben Hmida" ↔ "ZBH - Zied"),
 * ou si prénom OU nom correspond exactement à un token unique.
 * @param {string[]} craNames
 * @param {Array<{id:string, nom?:string, prenom?:string, name?:string, trigramme?:string}>} collaborateurs
 * @returns {Object} { craName: collabId | null }
 */
export function autoMatchConsultants(craNames, collaborateurs) {
  const result = {};
  for (const craName of craNames) {
    const craTokens = normalize(craName).split(' ').filter(Boolean);
    let best = null;
    let bestScore = 0;
    for (const c of collaborateurs) {
      const collabStr = normalize(
        [c.name, c.nom, c.prenom, c.trigramme].filter(Boolean).join(' ')
      );
      const collabTokens = collabStr.split(' ').filter(Boolean);
      const matched = craTokens.filter((t) => collabTokens.includes(t)).length;
      const score = matched / Math.max(1, Math.min(craTokens.length, collabTokens.length));
      if (score > bestScore) { bestScore = score; best = c.id; }
    }
    result[craName] = bestScore >= 0.5 ? best : null;
  }
  return result;
}

/**
 * Auto-matching mission → projet, par inclusion de nom normalisé.
 * "BM - Ark_us_dev" matchera un projet "ARK US" (tokens ark + us présents).
 */
export function autoMatchMissions(missions, projets) {
  const result = {};
  for (const mission of missions) {
    const mTokens = normalize(mission).split(' ').filter((t) => t.length > 1);
    let best = null;
    let bestScore = 0;
    for (const p of projets) {
      const pTokens = normalize(p.nom || p.name).split(' ').filter(Boolean);
      const matched = pTokens.filter((t) => mTokens.includes(t)).length;
      const score = pTokens.length ? matched / pTokens.length : 0;
      if (score > bestScore) { bestScore = score; best = p.id; }
    }
    result[mission] = bestScore >= 0.6 ? best : null;
  }
  return result;
}

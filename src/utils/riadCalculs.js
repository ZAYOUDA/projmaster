/**
 * riadCalculs.js — fonctions pures pour le module RIAD (Risques, Issues, Actions, Décisions).
 */

export const PROBABILITE_LEVELS = [
  { key: 'improbable', label: 'Improbable', valeur: 1 },
  { key: 'tres_peu_probable', label: 'Très peu probable', valeur: 2 },
  { key: 'possible', label: 'Possible', valeur: 3 },
  { key: 'probable', label: 'Probable', valeur: 4 },
  { key: 'presque_certain', label: 'Presque certain', valeur: 5 },
];

export const IMPACT_LEVELS = [
  { key: 'insignifiant', label: 'Insignifiant', valeur: 1 },
  { key: 'mineur', label: 'Mineur', valeur: 2 },
  { key: 'modere', label: 'Modéré', valeur: 3 },
  { key: 'majeur', label: 'Majeur', valeur: 4 },
  { key: 'catastrophique', label: 'Catastrophique', valeur: 5 },
];

export const STATUS_LEVELS = [
  { key: 'ouvert', label: 'Ouvert' },
  { key: 'en_cours', label: 'En cours' },
  { key: 'cloture', label: 'Clôturé' },
];

export const RIAD_MODULES = [
  { key: 'risques', label: 'Risques' },
  { key: 'issues', label: 'Incidents' },
  { key: 'actions', label: 'Actions' },
  { key: 'decisions', label: 'Décisions' },
];

export function estClos(item) {
  return item.status === 'cloture';
}

/** Couleur de sévérité (vert → rouge) pour une case de la matrice probabilité × impact. */
export function couleurSeverite(probaValeur, impactValeur) {
  const score = probaValeur * impactValeur; // 1..25
  if (score <= 4) return '#8BC34A';
  if (score <= 9) return '#CDDC39';
  if (score <= 12) return '#FFC107';
  if (score <= 16) return '#FF9800';
  return '#F44336';
}

/** Grille probabilité × impact : nombre de risques OUVERTS (non clôturés) par case. */
export function calculerMatriceRisques(risques) {
  const grille = {};
  PROBABILITE_LEVELS.forEach((p) => {
    grille[p.key] = {};
    IMPACT_LEVELS.forEach((i) => { grille[p.key][i.key] = 0; });
  });
  risques.filter((r) => !estClos(r)).forEach((r) => {
    if (grille[r.probabilite] && r.impact in grille[r.probabilite]) {
      grille[r.probabilite][r.impact] += 1;
    }
  });
  return grille;
}

/** Tableau d'escalade : une ligne par niveau, une colonne par module RIAD, + ligne Total. */
export function calculerTableauEscalade(riad, escaladeNiveaux, clos) {
  const modules = RIAD_MODULES.map((m) => m.key);
  const rows = escaladeNiveaux.map((niveau) => {
    const row = { niveau };
    modules.forEach((m) => {
      row[m] = (riad[m] || []).filter((it) => it.escalade === niveau && estClos(it) === clos).length;
    });
    return row;
  });
  const total = { niveau: 'Total' };
  modules.forEach((m) => { total[m] = rows.reduce((s, r) => s + r[m], 0); });
  return { rows, total };
}

/** Total toutes escalades / tous statuts confondus, par module — contrôle de cohérence. */
export function calculerSanityCheck(riad) {
  const total = { niveau: 'Total' };
  RIAD_MODULES.forEach(({ key }) => { total[key] = (riad[key] || []).length; });
  return total;
}

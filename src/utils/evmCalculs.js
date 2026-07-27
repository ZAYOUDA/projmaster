// EVM (Earned Value Management) — CPI (coût) et SPI (délai), calculés uniquement pour les
// projets BUILD (les projets RUN suivent un modèle de consommation de jours par commande,
// pas un WBS budgétisé avec avancement — EVM ne s'y applique pas).
//
// Définitions :
//  - BAC (Budget At Completion) : budget total prévu d'une tâche = jours_prev × TJM
//  - AC  (Actual Cost)          : coût réellement engagé à date = jours_realises × TJM
//  - EV  (Earned Value)         : valeur du travail réellement accompli = % avancement × BAC
//  - PV  (Planned Value)        : ce qui aurait dû être dépensé à date selon le plan
//
//  CPI = EV / AC → efficience coût (>1 : le travail fait coûte moins cher que prévu)
//  SPI = EV / PV → efficience délai (>1 : en avance sur le planning)
//
// Limite à connaître : ce calcul se fait contre le plan "vivant" (jours_prev/dates éditables
// à tout moment), pas contre une baseline gelée — un CPI/SPI EVM classique se mesure contre un
// PMB figé. Le champ `projet.reporting_snapshots` existe pour figer un instantané plus tard.

export const CPI_DEFINITION =
  "CPI (Cost Performance Index) = Valeur Acquise (EV) / Coût Réel (AC). Mesure l'efficience " +
  'budgétaire : >1 = le travail réalisé coûte moins cher que prévu, <1 = dérive de coûts.';

export const SPI_DEFINITION =
  "SPI (Schedule Performance Index) = Valeur Acquise (EV) / Valeur Planifiée (PV). Mesure " +
  "l'efficience délai : >1 = avance sur le planning, <1 = retard. Limite connue : un simple " +
  "retard de démarrage dégrade ce chiffre même si le rythme d'exécution est ensuite conforme " +
  "au plan — voir SPI(t) ci-dessous, ou mettez à jour les dates prévues si le retard est déjà acté.";

export const SPI_T_DEFINITION =
  "SPI(t) (Earned Schedule) = Temps Acquis (ES) / Temps Écoulé (AT). Version plus robuste du " +
  "SPI classique : elle mesure la vitesse d'exécution réelle en unités de temps plutôt qu'un " +
  "simple ratio de valeur, et ne s'écrase pas artificiellement vers 1 en fin de projet. " +
  ">1 = rythme plus rapide que prévu, <1 = rythme plus lent que prévu.";

function tjmDe(collaborateurId, tjmList) {
  const t = tjmList.find((t) => t.collaborateur_id === collaborateurId);
  return t ? t.montant : 0;
}

// Valeur Planifiée d'une feuille à une date de référence : utilise le planning journalier
// (affectation.planning) si renseigné, sinon une répartition linéaire entre date_debut_prev
// et date_fin_prev (fallback quand la tâche n'a pas été planifiée jour par jour).
function pvNoeud(node, tjmList, dateRef) {
  const affectations = node.affectations || [];
  const aPlanningJournalier = affectations.some((a) => Object.keys(a.planning || {}).length > 0);

  if (aPlanningJournalier) {
    const refIso = dateRef.toISOString().slice(0, 10);
    return affectations.reduce((s, a) => {
      const tjm = tjmDe(a.collaborateur_id, tjmList);
      const jours = Object.entries(a.planning || {})
        .filter(([iso]) => iso <= refIso)
        .reduce((sa, [, v]) => sa + v, 0);
      return s + jours * tjm;
    }, 0);
  }

  if (!node.date_debut_prev || !node.date_fin_prev) return 0;
  const debut = new Date(node.date_debut_prev);
  const fin = new Date(node.date_fin_prev);
  const bac = affectations.reduce((s, a) => s + a.jours_prev * tjmDe(a.collaborateur_id, tjmList), 0);
  if (fin <= debut) return dateRef >= fin ? bac : 0;
  const fraction = Math.min(1, Math.max(0, (dateRef - debut) / (fin - debut)));
  return fraction * bac;
}

// EVM d'une feuille (tâche sans enfants) : BAC/AC recalculés localement (indépendant de
// calculerBudgetNoeud), EV via le % avancement manuel du WBS, PV via pvNoeud.
function evmNoeud(node, tjmList, dateRef) {
  let bac = 0, ac = 0;
  (node.affectations || []).forEach((a) => {
    const tjm = tjmDe(a.collaborateur_id, tjmList);
    bac += a.jours_prev * tjm;
    ac += a.jours_realises * tjm;
  });
  const ev = (node.avancement || 0) / 100 * bac;
  const pv = pvNoeud(node, tjmList, dateRef);
  return { bac, ac, ev, pv };
}

// Agrège BAC/AC/EV/PV sur toutes les feuilles du WBS et calcule CPI/SPI.
// Retourne null si le projet n'est pas de type BUILD (EVM non applicable aux projets RUN).
export function calculerEVMProjet(projet, dateRef = new Date()) {
  if (projet.type !== 'BUILD') return null;

  const wbs = projet.wbs || [];
  const feuilles = wbs.filter((n) => !wbs.some((c) => c.parent_id === n.id));

  const totaux = feuilles.reduce((acc, n) => {
    const e = evmNoeud(n, projet.tjm || [], dateRef);
    return { bac: acc.bac + e.bac, ac: acc.ac + e.ac, ev: acc.ev + e.ev, pv: acc.pv + e.pv };
  }, { bac: 0, ac: 0, ev: 0, pv: 0 });

  return {
    ...totaux,
    cpi: totaux.ac > 0 ? totaux.ev / totaux.ac : null,
    spi: totaux.pv > 0 ? totaux.ev / totaux.pv : null,
  };
}

// Somme la Valeur Planifiée du projet à une date arbitraire (réutilise pvNoeud par feuille).
// Fonction croissante (ou stable) de la date — nécessaire pour la recherche par dichotomie
// de l'Earned Schedule ci-dessous.
function pvProjetADate(feuilles, tjmList, dateRef) {
  return feuilles.reduce((s, n) => s + pvNoeud(n, tjmList, dateRef), 0);
}

// Earned Schedule (Lipke) : au lieu du ratio EV/PV classique (qui pénalise indéfiniment un
// simple retard de démarrage et s'écrase artificiellement vers 1 en fin de projet), on cherche
// l'instant ES du plan d'origine où la Valeur Planifiée cumulée aurait égalé l'EV actuel, puis
// on compare ES au Temps Écoulé réel (AT) depuis le début planifié. SPI(t) = ES / AT.
// Retourne null si le projet n'est pas BUILD, ou si aucune feuille n'a de date_debut_prev
// (impossible de situer le début du projet sur une ligne de temps).
export function calculerEarnedSchedule(projet, dateRef = new Date()) {
  if (projet.type !== 'BUILD') return null;

  const wbs = projet.wbs || [];
  const feuilles = wbs.filter((n) => !wbs.some((c) => c.parent_id === n.id));
  const tjmList = projet.tjm || [];

  const debuts = feuilles.map((n) => n.date_debut_prev).filter(Boolean).map((d) => new Date(d));
  if (debuts.length === 0) return null;
  const debutProjet = new Date(Math.min(...debuts));

  const at = (dateRef - debutProjet) / 86400000; // jours écoulés depuis le début planifié
  if (at <= 0) return { es: 0, at: 0, spiT: null };

  const evm = calculerEVMProjet(projet, dateRef);
  const ev = evm ? evm.ev : 0;

  const fins = feuilles.map((n) => n.date_fin_prev).filter(Boolean).map((d) => new Date(d));
  const finPlanifiee = fins.length ? new Date(Math.max(...fins)) : dateRef;
  const borneHaute = finPlanifiee > dateRef ? finPlanifiee : dateRef;

  const pvBorneHaute = pvProjetADate(feuilles, tjmList, borneHaute);

  let esDate;
  if (ev <= 0) {
    esDate = debutProjet;
  } else if (ev >= pvBorneHaute) {
    esDate = borneHaute;
  } else {
    let lo = debutProjet.getTime();
    let hi = borneHaute.getTime();
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const pvMid = pvProjetADate(feuilles, tjmList, new Date(mid));
      if (pvMid < ev) lo = mid; else hi = mid;
    }
    esDate = new Date((lo + hi) / 2);
  }

  const es = (esDate - debutProjet) / 86400000;
  return { es, at, spiT: at > 0 ? es / at : null };
}

// Détecte les tâches où le % de jours consommés dépasse largement le % d'avancement déclaré —
// signe probable que l'avancement n'a pas été remis à jour au même rythme que l'imputation
// réelle (cause la plus fréquente d'un CPI qui semble "trop bas" sans dérive de coût réelle).
export function detecterAvancementNonAJour(projet, seuilEcartPoints = 20) {
  if (projet.type !== 'BUILD') return [];

  const wbs = projet.wbs || [];
  const feuilles = wbs.filter((n) => !wbs.some((c) => c.parent_id === n.id));

  const alertes = [];
  feuilles.forEach((n) => {
    const affectations = n.affectations || [];
    const joursPrev = affectations.reduce((s, a) => s + (a.jours_prev || 0), 0);
    const joursRealises = affectations.reduce((s, a) => s + (a.jours_realises || 0), 0);
    if (joursPrev <= 0 || joursRealises <= 0) return;

    const pctJours = Math.min(100, (joursRealises / joursPrev) * 100);
    const pctAvancement = n.avancement || 0;
    const ecart = pctJours - pctAvancement;
    if (ecart >= seuilEcartPoints) {
      alertes.push({ id: n.id, nom: n.nom, pctJours: Math.round(pctJours), pctAvancement, ecart: Math.round(ecart) });
    }
  });

  return alertes.sort((a, b) => b.ecart - a.ecart);
}

// Classe un index CPI/SPI pour l'affichage : >=1 conforme, 0.9-1 à surveiller, <0.9 dérive.
export function classifierIndexEVM(index) {
  if (index === null || index === undefined) return 'neutral';
  if (index >= 1) return 'success';
  if (index >= 0.9) return 'warning';
  return 'danger';
}

// Agrège les totaux EV/AC/PV de plusieurs projets BUILD — sommation des valeurs absolues
// (bonne pratique EVM pour un portefeuille), plutôt qu'une moyenne des index CPI/SPI.
export function calculerEVMPortefeuille(projets, dateRef = new Date()) {
  const evms = projets.map((p) => calculerEVMProjet(p, dateRef)).filter(Boolean);
  const totaux = evms.reduce((acc, e) => ({
    bac: acc.bac + e.bac, ac: acc.ac + e.ac, ev: acc.ev + e.ev, pv: acc.pv + e.pv,
  }), { bac: 0, ac: 0, ev: 0, pv: 0 });
  return {
    ...totaux,
    cpi: totaux.ac > 0 ? totaux.ev / totaux.ac : null,
    spi: totaux.pv > 0 ? totaux.ev / totaux.pv : null,
  };
}

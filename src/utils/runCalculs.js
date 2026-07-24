/**
 * runCalculs.js — fonctions pures de pilotage d'un projet RUN (TMA / régie à enveloppe).
 * Aucune dépendance store/React : entrées = données brutes du projet, sorties = valeurs calculées.
 */

export function moisAnnee(annee) {
  return Array.from({ length: 12 }, (_, i) => `${annee}-${String(i + 1).padStart(2, '0')}`);
}

export function arrondiJours(n) {
  return Math.round((n || 0) * 4) / 4;
}

export function arrondiMontant(n) {
  return Math.round((n || 0) * 100) / 100;
}

export function totalLigneSurMois(ligneId, consoMensuelle, months) {
  return months.reduce((s, m) => s + (consoMensuelle[m]?.[ligneId] || 0), 0);
}

/** Consommé / HT / reste pour une ligne de commande, sur l'ensemble des mois fournis. */
export function calculerSuiviLigne(ligne, consoMensuelle, months) {
  const consoTotale = totalLigneSurMois(ligne.id, consoMensuelle, months);
  const htConso = arrondiMontant(consoTotale * ligne.pu);
  const reste = ligne.nbjCommande != null ? arrondiJours(ligne.nbjCommande - consoTotale) : null;
  return { consoTotale: arrondiJours(consoTotale), htConso, reste };
}

/** Agrégats projet (toutes commandes/lignes fournies, typiquement filtrées sur une année). */
export function calculerSuiviProjetRun(commandes, consoMensuelle, months) {
  const parLigne = {};
  let cmdNbj = 0, cmdHt = 0, consoNbj = 0, consoHt = 0;
  for (const cmd of commandes) {
    for (const l of cmd.lignes) {
      const s = calculerSuiviLigne(l, consoMensuelle, months);
      parLigne[l.id] = s;
      cmdNbj += l.nbjCommande || 0;
      cmdHt += (l.nbjCommande || 0) * l.pu;
      consoNbj += s.consoTotale;
      consoHt += s.htConso;
    }
  }
  return {
    parLigne,
    cmdNbj: arrondiJours(cmdNbj),
    cmdHt: arrondiMontant(cmdHt),
    consoNbj: arrondiJours(consoNbj),
    consoHt: arrondiMontant(consoHt),
    reste: arrondiJours(cmdNbj - consoNbj),
    resteHt: arrondiMontant(cmdHt - consoHt),
  };
}

/**
 * Burn rate (moyenne des mois écoulés avec conso > 0) et projection d'épuisement.
 * @param {number} currentMonthIdx nombre de mois de l'année à considérer comme "écoulés" (1-12)
 * @returns {{ burn: number, projection: null | { depasseAnnee: boolean, moisIndex: number|null } }}
 */
export function calculerBurnRateEtProjection(commandes, consoMensuelle, months, currentMonthIdx) {
  const elapsed = months.slice(0, currentMonthIdx);
  const activeMonths = elapsed.filter((m) => Object.values(consoMensuelle[m] ?? {}).some((v) => v > 0));
  const { consoNbj, cmdNbj } = calculerSuiviProjetRun(commandes, consoMensuelle, months);
  const burn = activeMonths.length ? consoNbj / activeMonths.length : 0;
  const reste = cmdNbj - consoNbj;
  const moisRestants = burn > 0 ? reste / burn : Infinity;
  if (!Number.isFinite(moisRestants)) return { burn, projection: null };
  const epuisementIdx = currentMonthIdx + moisRestants;
  const depasseAnnee = epuisementIdx > 12;
  const moisIndex = depasseAnnee ? null : Math.min(11, Math.floor(epuisementIdx) - 1);
  return { burn, projection: { depasseAnnee, moisIndex } };
}

/** Montant HT facturable d'un mois donné (toutes commandes confondues). */
export function calculerFacturableMois(commandes, consoMensuelle, month) {
  let ht = 0;
  for (const cmd of commandes) {
    for (const l of cmd.lignes) {
      ht += (consoMensuelle[month]?.[l.id] || 0) * l.pu;
    }
  }
  return arrondiMontant(ht);
}

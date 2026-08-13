export function calculerNumeroWBS(nodes) {
  const racines = nodes
    .filter((n) => n.parent_id === null)
    .sort((a, b) => a.ordre - b.ordre);

  const numeros = {};

  function attribuer(list, prefix) {
    list.forEach((node, i) => {
      const num = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      numeros[node.id] = num;
      const enfants = nodes
        .filter((n) => n.parent_id === node.id)
        .sort((a, b) => a.ordre - b.ordre);
      attribuer(enfants, num);
    });
  }

  attribuer(racines, '');
  return numeros;
}

// Aplatit le WBS (arbre à plat via parent_id) en une liste ordonnée { node, depth } en
// parcours en profondeur, dans l'ordre d'affichage habituel (racines puis enfants triés par
// `ordre`) — utile pour toute vue tabulaire indentée (résumé client, export...).
export function flattenWBS(nodes) {
  const result = [];
  const visiter = (list, depth) => {
    list.sort((a, b) => a.ordre - b.ordre).forEach((node) => {
      result.push({ node, depth });
      const enfants = nodes.filter((n) => n.parent_id === node.id);
      if (enfants.length > 0) visiter(enfants, depth + 1);
    });
  };
  visiter(nodes.filter((n) => n.parent_id === null), 0);
  return result;
}

export function calculerBudgetNoeud(node, allNodes, tjmList) {
  const enfants = allNodes.filter((n) => n.parent_id === node.id);

  if (enfants.length === 0) {
    let prev = 0, conso = 0;
    (node.affectations || []).forEach((aff) => {
      const tjmEntry = tjmList.find((t) => t.collaborateur_id === aff.collaborateur_id);
      const tjm = tjmEntry ? tjmEntry.montant : 0;
      prev += aff.jours_prev * tjm;
      conso += aff.jours_realises * tjm;
    });
    return { prev, conso, reste: prev - conso };
  }

  const totaux = enfants.map((e) => calculerBudgetNoeud(e, allNodes, tjmList));
  return {
    prev: totaux.reduce((s, t) => s + t.prev, 0),
    conso: totaux.reduce((s, t) => s + t.conso, 0),
    reste: totaux.reduce((s, t) => s + t.reste, 0),
  };
}

export function calculerBudgetProjet(projet) {
  const feuilles = projet.wbs.filter(
    (n) => !projet.wbs.some((c) => c.parent_id === n.id)
  );
  let prev = 0, conso = 0;
  feuilles.forEach((node) => {
    const b = calculerBudgetNoeud(node, projet.wbs, projet.tjm);
    prev += b.prev;
    conso += b.conso;
  });
  return { prev, conso, reste: prev - conso };
}

// Un collaborateur externe (co-traitance / client, projets en co-construction) est identifié par
// un préfixe "EXT" sur son prénom ou son nom — convention de nommage à la création (pas de champ
// dédié), ex. "EXT-Dupont". Fonction centrale : utilisée par Planning (KPI charge) et Facturation
// (KPI budget consommé) pour rester cohérentes entre elles.
export function estCollaborateurExterne(c) {
  if (!c) return false;
  return (c.nom || '').trim().toUpperCase().startsWith('EXT') || (c.prenom || '').trim().toUpperCase().startsWith('EXT');
}

// Décompose le budget d'un projet BUILD (prév. et consommé, jours_prev/jours_realises × TJM)
// entre collaborateurs internes et externes — cf. estCollaborateurExterne. Ne recalcule pas via
// calculerBudgetNoeud (qui agrège récursivement les enfants) : comme les affectations ne vivent
// que sur les feuilles, sommer directement leurs affectations donne le même total sans risque de
// double comptage, et permet de trancher interne/externe par affectation.
export function calculerBudgetParTypeCollab(projet, collaborateurs) {
  const feuilles = projet.wbs.filter((n) => !projet.wbs.some((c) => c.parent_id === n.id));
  let prevInterne = 0, prevExterne = 0, consoInterne = 0, consoExterne = 0;
  feuilles.forEach((node) => {
    (node.affectations || []).forEach((aff) => {
      const tjmEntry = projet.tjm.find((t) => t.collaborateur_id === aff.collaborateur_id);
      const tjm = tjmEntry ? tjmEntry.montant : 0;
      const externe = estCollaborateurExterne(collaborateurs.find((c) => c.id === aff.collaborateur_id));
      if (externe) {
        prevExterne += (aff.jours_prev || 0) * tjm;
        consoExterne += (aff.jours_realises || 0) * tjm;
      } else {
        prevInterne += (aff.jours_prev || 0) * tjm;
        consoInterne += (aff.jours_realises || 0) * tjm;
      }
    });
  });
  return { prevInterne, prevExterne, consoInterne, consoExterne };
}

// % d'avancement auto-suggéré pour une feuille, basé sur jours réalisés / jours prévus — null si
// aucun jour prévu (rien à calculer, on ne force pas 0). Volontairement PAS borné à 100 : en cas de
// dépassement (jours réalisés > jours prévus), le % dépasse 100 pour signaler l'ampleur du
// dépassement (ex. 150%) plutôt que d'être écrêté et de masquer l'info — l'affichage le colore en
// rouge (cf. ProjetWBS.jsx) pour rester lisible. Utilisé pour pré-remplir `avancement`
// automatiquement (voir `avancement_auto` sur les nœuds WBS dans useAppStore.js), sans empêcher la
// correction manuelle : l'utilisateur reste maître du chiffre affiché.
export function calculerAvancementAutoNoeud(node) {
  const affs = node.affectations || [];
  const prev = affs.reduce((s, a) => s + (a.jours_prev || 0), 0);
  const reel = affs.reduce((s, a) => s + (a.jours_realises || 0), 0);
  if (prev <= 0) return null;
  return Math.round((reel / prev) * 100);
}

// Jours prév./réels agrégés sur toutes les feuilles descendantes d'un nœud (lui-même s'il est déjà
// une feuille) — sert à détecter un dépassement (jours réalisés > jours prévus) pour colorer le %
// d'avancement en rouge, aussi bien sur une tâche que sur un livrable/parent (agrégation).
export function calculerJoursNoeud(node, allNodes) {
  const leaves = getLeaves(node, allNodes).filter((n) => n.type !== 'jalon');
  let prev = 0, reel = 0;
  leaves.forEach((l) => (l.affectations || []).forEach((a) => {
    prev += a.jours_prev || 0;
    reel += a.jours_realises || 0;
  }));
  return { prev, reel };
}

// Feuilles descendantes d'un nœud (lui-même s'il n'a pas d'enfants).
export function getLeaves(node, allNodes) {
  const children = allNodes.filter((n) => n.parent_id === node.id);
  if (children.length === 0) return [node];
  return children.flatMap((c) => getLeaves(c, allNodes));
}

// Dernier jour du mois "AAAA-MM" (pour borner la période d'un réalisé saisi au mois).
function dernierJourMois(mois) {
  const [y, m] = mois.split('-').map(Number);
  return `${mois}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

// Déduit Début réel / Fin réelle d'une tâche à partir de son imputation réelle
// (planning_reel au jour, jours_realises_par_mois au mois) — évite d'avoir à les
// saisir manuellement en plus de l'imputation.
export function deriverDatesReellesNoeud(node) {
  const dates = [];
  (node.affectations || []).forEach((a) => {
    Object.entries(a.planning_reel || {}).forEach(([iso, v]) => { if (v > 0) dates.push(iso); });
    Object.entries(a.jours_realises_par_mois || {}).forEach(([mois, v]) => {
      if (v > 0) { dates.push(`${mois}-01`); dates.push(dernierJourMois(mois)); }
    });
  });
  if (dates.length === 0) return { date_debut_reel: null, date_fin_reel: null };
  dates.sort();
  return { date_debut_reel: dates[0], date_fin_reel: dates[dates.length - 1] };
}

// Dates prév./réelles (min début, max fin) et avancement moyen, remontés depuis les feuilles.
// Pour une feuille, retourne simplement ses propres valeurs.
export function agregerDatesEtAvancement(node, allNodes) {
  const leaves = getLeaves(node, allNodes).filter((n) => n.type !== 'jalon');
  if (leaves.length === 0) {
    return {
      date_debut_prev: node.date_debut_prev, date_fin_prev: node.date_fin_prev,
      date_debut_reel: node.date_debut_reel, date_fin_reel: node.date_fin_reel,
      avancement: node.avancement || 0,
    };
  }

  const prevDebuts = leaves.map((l) => l.date_debut_prev).filter(Boolean).map((d) => new Date(d));
  const prevFins   = leaves.map((l) => l.date_fin_prev).filter(Boolean).map((d) => new Date(d));
  const reelDebuts = leaves.map((l) => l.date_debut_reel).filter(Boolean).map((d) => new Date(d));
  const reelFins   = leaves.map((l) => l.date_fin_reel).filter(Boolean).map((d) => new Date(d));
  const avancements = leaves.map((l) => l.avancement || 0);

  return {
    date_debut_prev: prevDebuts.length ? new Date(Math.min(...prevDebuts)).toISOString().slice(0, 10) : null,
    date_fin_prev:   prevFins.length   ? new Date(Math.max(...prevFins)).toISOString().slice(0, 10)   : null,
    date_debut_reel: reelDebuts.length ? new Date(Math.min(...reelDebuts)).toISOString().slice(0, 10) : null,
    date_fin_reel:   reelFins.length   ? new Date(Math.max(...reelFins)).toISOString().slice(0, 10)   : null,
    avancement: Math.round(avancements.reduce((s, v) => s + v, 0) / avancements.length),
  };
}

export function calculerAvancementProjet(projet) {
  const taches = projet.wbs.filter((n) => n.type !== 'jalon');
  if (taches.length === 0) return 0;
  const total = taches.reduce((s, n) => s + (n.avancement || 0), 0);
  return Math.round(total / taches.length);
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(amount);
}

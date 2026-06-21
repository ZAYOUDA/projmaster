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

const MATRICE_CRITICITE = {
  faible:  { faible: 'faible', moyen: 'faible',  eleve: 'moyenne'  },
  moyenne: { faible: 'faible', moyen: 'moyenne',  eleve: 'elevee'   },
  elevee:  { faible: 'moyenne', moyen: 'elevee', eleve: 'critique'  },
};

export function calculerCriticite(probabilite, impact) {
  return MATRICE_CRITICITE[probabilite]?.[impact] ?? 'faible';
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

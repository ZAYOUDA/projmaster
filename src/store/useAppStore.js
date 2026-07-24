import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  subscribeCollaborateurs, saveCollaborateur, patchCollaborateur, removeCollaborateur,
  subscribeProjets, saveProjet, patchProjet, removeProjet,
  subscribeUsers, subscribeUserDoc, saveUser, patchUser,
} from '../firebase/firestore';
import { defaultData } from '../data/defaultData';
import { exportData, importData } from '../data/storage';
import { deriverDatesReellesNoeud } from '../data/calculations';

function calculerQuadrant(influence, interet) {
  if (influence >= 3 && interet >= 3) return 'gerer_activement';
  if (influence >= 3 && interet < 3)  return 'garder_satisfait';
  if (influence < 3  && interet >= 3) return 'informer';
  return 'surveiller';
}

const RIAD_PROBA_LEGACY = { faible: 'tres_peu_probable', moyenne: 'possible', elevee: 'probable' };
const RIAD_IMPACT_LEGACY = { faible: 'mineur', moyen: 'modere', eleve: 'majeur' };
const RIAD_STATUT_LEGACY = { ouvert: 'ouvert', en_traitement: 'en_cours', clos: 'cloture' };

// Convertit un risque de l'ancien registre (V1-V3) vers le modèle RIAD.
function migrerRisqueLegacy(r, escaladeDefault) {
  return {
    id: r.id,
    numero: null, // attribué à l'affichage / à la première écriture
    categorie: '',
    type: '',
    description: r.titre ? (r.description ? `${r.titre} — ${r.description}` : r.titre) : (r.description || ''),
    escalade: escaladeDefault,
    impact: RIAD_IMPACT_LEGACY[r.impact] || 'modere',
    probabilite: RIAD_PROBA_LEGACY[r.probabilite] || 'possible',
    responsable: r.proprietaire || '',
    plan_action: r.plan_mitigation || '',
    deadline: r.date_echeance || null,
    status: RIAD_STATUT_LEGACY[r.statut] || 'ouvert',
    commentaire: '',
  };
}

const DEFAULT_ESCALADE_NIVEAUX = ['Niveau Projet', 'Comité 1', 'Comité 2'];

function migrateProjet(p) {
  const escalade_niveaux = p.escalade_niveaux || DEFAULT_ESCALADE_NIVEAUX;
  const riad = p.riad || {
    risques: (p.risques || []).map((r) => migrerRisqueLegacy(r, escalade_niveaux[0])),
    issues: [],
    actions: [],
    decisions: [],
  };
  return {
    type: 'BUILD',
    stakeholders: [],
    factures: [],
    commandes: [],
    facturation_params: { tva: 20, delai_paiement: 30, prochain_numero: 1 },
    reporting_snapshots: [],
    consoMensuelle: {},
    consoNonAffectee: {},
    moisVerrouilles: [],
    importsCra: [],
    ...p,
    escalade_niveaux,
    riad: {
      risques: riad.risques || [],
      issues: riad.issues || [],
      actions: riad.actions || [],
      decisions: riad.decisions || [],
    },
    wbs: (p.wbs || []).map((n) => {
      const affectations = (n.affectations || []).map((a) => {
        const base = { jours_realises_par_mois: {}, ...a };
        const fromPlanning = Object.values(base.planning_reel || {}).reduce((acc, v) => acc + v, 0);
        const fromMois = Object.values(base.jours_realises_par_mois || {}).reduce((acc, v) => acc + v, 0);
        const jours_realises = Math.max(fromPlanning, fromMois, base.jours_realises || 0);
        return { ...base, jours_realises };
      });
      // Rattrapage rétroactif : déduit Début réel/Fin réelle depuis l'imputation existante
      // (pour les tâches déjà imputées avant l'introduction de cette déduction automatique).
      const derived = deriverDatesReellesNoeud({ affectations });
      return {
        ...n,
        affectations,
        date_debut_reel: derived.date_debut_reel || n.date_debut_reel || null,
        date_fin_reel: derived.date_fin_reel || n.date_fin_reel || null,
      };
    }),
  };
}

const useAppStore = create((set, get) => ({
  collaborateurs: [],
  projets: [],
  usersAdmin: [],
  savedAt: null,
  _unsubscribers: [],

  init: (userDoc) => {
    get()._unsubscribers.forEach((u) => u());

    const isCollab = userDoc?.role === 'collaborateur';
    const uid = userDoc?.uid;

    const unsubCollabs = subscribeCollaborateurs((items) => {
      set({ collaborateurs: items });
    });

    // Pour les collabs : filtre sur leurs projets autorisés uniquement
    const projetIds = isCollab ? (userDoc.projets_autorises || []) : null;
    const unsubProjets = subscribeProjets((items) => {
      set({ projets: items.map(migrateProjet) });
    }, projetIds);

    const unsubUsers = subscribeUsers((items) => {
      set({ usersAdmin: items });
    });

    // Pour les collabs : re-init si projets_autorises change (admin assigne un nouveau projet)
    let unsubMyDoc = () => {};
    if (isCollab && uid) {
      let currentIds = JSON.stringify(projetIds || []);
      unsubMyDoc = subscribeUserDoc(uid, (freshDoc) => {
        const newIds = JSON.stringify(freshDoc.projets_autorises || []);
        if (newIds !== currentIds) {
          currentIds = newIds;
          get().init(freshDoc);
        }
      });
    }

    set({ _unsubscribers: [unsubCollabs, unsubProjets, unsubUsers, unsubMyDoc] });
  },

  destroy: () => {
    get()._unsubscribers.forEach((u) => u());
    set({ _unsubscribers: [], usersAdmin: [] });
  },

  _touch: () => set({ savedAt: new Date().toISOString() }),

  // ── Collaborateurs ──────────────────────────────────────────────
  addCollaborateur: async (collab) => {
    const id = uuidv4();
    const newCollab = {
      ...collab,
      id,
      initiales: collab.initiales || `${collab.prenom[0]}${collab.nom[0]}`.toUpperCase(),
      actif: true,
      conges: collab.conges || {},
      user_id: null,
    };
    await saveCollaborateur(id, newCollab);
    get()._touch();
    return newCollab;
  },

  updateCollaborateur: async (id, updates) => {
    await patchCollaborateur(id, updates);
    get()._touch();
  },

  toggleCollaborateurActif: async (id) => {
    const c = get().collaborateurs.find((c) => c.id === id);
    if (!c) return;
    await patchCollaborateur(id, { actif: !c.actif });
    get()._touch();
  },

  // ── Congés ──────────────────────────────────────────────────────
  setConge: async (collabId, date, valeur) => {
    const c = get().collaborateurs.find((c) => c.id === collabId);
    if (!c) return;
    const conges = { ...(c.conges || {}) };
    if (!valeur || valeur === 0) delete conges[date];
    else conges[date] = valeur;
    await patchCollaborateur(collabId, { conges });
    get()._touch();
  },

  // ── Projets ─────────────────────────────────────────────────────
  addProjet: async (projet) => {
    const PROJ_COLORS = ['#378ADD', '#1D9E75', '#BA7517', '#D4537E', '#7F77DD', '#D85A30', '#888780', '#5DCAA5'];
    const usedColors = get().projets.map((p) => p.couleur);
    const couleur = PROJ_COLORS.find((c) => !usedColors.includes(c)) || PROJ_COLORS[0];
    const id = uuidv4();
    const newProjet = {
      id,
      type: 'BUILD',
      couleur,
      statut: 'actif',
      wbs: [],
      milestones: [],
      tjm: [],
      stakeholders: [],
      factures: [],
      commandes: [],
      facturation_params: { tva: 20, delai_paiement: 30, prochain_numero: 1 },
      reporting_snapshots: [],
      consoMensuelle: {},
      consoNonAffectee: {},
      moisVerrouilles: [],
      importsCra: [],
      escalade_niveaux: DEFAULT_ESCALADE_NIVEAUX,
      riad: { risques: [], issues: [], actions: [], decisions: [] },
      ...projet,
    };
    await saveProjet(id, newProjet);
    get()._touch();
    return newProjet;
  },

  updateProjet: async (id, updates) => {
    const p = get().projets.find((p) => p.id === id);
    if (!p) return;
    await saveProjet(id, { ...p, ...updates });
    get()._touch();
  },

  deleteProjet: async (id) => {
    await removeProjet(id);
    get()._touch();
  },

  // ── TJM ─────────────────────────────────────────────────────────
  setTJM: async (projetId, collaborateurId, montant) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const exists = p.tjm.find((t) => t.collaborateur_id === collaborateurId);
    const tjm = exists
      ? p.tjm.map((t) => t.collaborateur_id === collaborateurId ? { ...t, montant } : t)
      : [...p.tjm, { collaborateur_id: collaborateurId, montant, devise: 'EUR' }];
    await saveProjet(projetId, { ...p, tjm });
    get()._touch();
  },

  removeTJM: async (projetId, collaborateurId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    await saveProjet(projetId, { ...p, tjm: p.tjm.filter((t) => t.collaborateur_id !== collaborateurId) });
    get()._touch();
  },

  // ── WBS ─────────────────────────────────────────────────────────
  addWBSNode: async (projetId, node) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const newNode = {
      id: node.id || uuidv4(),
      ordre: 999,
      avancement: 0,
      statut: 'non_demarre',
      kanban_colonne: 'backlog',
      affectations: [],
      description: '',
      date_debut_prev: null,
      date_fin_prev: null,
      date_debut_reel: null,
      date_fin_reel: null,
      ...node,
    };
    await saveProjet(projetId, { ...p, wbs: [...p.wbs, newNode] });
    get()._touch();
    return newNode;
  },

  updateWBSNode: async (projetId, nodeId, updates) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const wbs = p.wbs.map((n) => n.id === nodeId ? { ...n, ...updates } : n);
    await patchProjet(projetId, { wbs });
    get()._touch();
  },

  deleteWBSNode: async (projetId, nodeId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const toDelete = new Set();
    const collect = (id) => {
      toDelete.add(id);
      p.wbs.filter((n) => n.parent_id === id).forEach((c) => collect(c.id));
    };
    collect(nodeId);
    await saveProjet(projetId, { ...p, wbs: p.wbs.filter((n) => !toDelete.has(n.id)) });
    get()._touch();
  },

  // Suppression groupée (évite la race condition du forEach)
  deleteWBSNodesBulk: async (projetId, rootIds) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const toDelete = new Set();
    const collect = (id) => {
      toDelete.add(id);
      p.wbs.filter((n) => n.parent_id === id).forEach((c) => collect(c.id));
    };
    rootIds.forEach(collect);
    await saveProjet(projetId, { ...p, wbs: p.wbs.filter((n) => !toDelete.has(n.id)) });
    get()._touch();
  },

  // ── Affectations ────────────────────────────────────────────────
  addAffectation: async (projetId, nodeId, affectation) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const newAff = {
      id: uuidv4(),
      jours_prev: 0,
      jours_realises: 0,
      jours_realises_par_mois: {},
      planning: {},
      planning_reel: {},
      ...affectation,
    };
    const wbs = p.wbs.map((n) =>
      n.id !== nodeId ? n : { ...n, affectations: [...n.affectations, newAff] }
    );
    await saveProjet(projetId, { ...p, wbs });
    get()._touch();
  },

  updateAffectation: async (projetId, nodeId, affId, updates) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const wbs = p.wbs.map((n) =>
      n.id !== nodeId ? n : {
        ...n,
        affectations: n.affectations.map((a) => a.id === affId ? { ...a, ...updates } : a),
      }
    );
    await saveProjet(projetId, { ...p, wbs });
    get()._touch();
  },

  setChargeRealiseMois: async (projetId, nodeId, affId, mois, jours) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const wbs = p.wbs.map((n) => {
      if (n.id !== nodeId) return n;
      const affectations = n.affectations.map((a) => {
        if (a.id !== affId) return a;
        const jours_realises_par_mois = { ...(a.jours_realises_par_mois || {}) };
        if (!jours || jours === 0) delete jours_realises_par_mois[mois];
        else jours_realises_par_mois[mois] = jours;
        const jours_realises = Object.values(jours_realises_par_mois).reduce((acc, v) => acc + v, 0);
        return { ...a, jours_realises_par_mois, jours_realises };
      });
      // Déduit Début réel / Fin réelle depuis l'imputation, pour éviter d'avoir à les saisir en plus.
      const derived = deriverDatesReellesNoeud({ affectations });
      return {
        ...n, affectations,
        date_debut_reel: derived.date_debut_reel || n.date_debut_reel || null,
        date_fin_reel: derived.date_fin_reel || n.date_fin_reel || null,
      };
    });
    await saveProjet(projetId, { ...p, wbs });
    get()._touch();
  },

  setChargePlanningReel: async (projetId, nodeId, affId, date, valeur) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;

    let wbs = p.wbs.map((n) => {
      if (n.id !== nodeId) return n;
      const affectations = n.affectations.map((a) => {
        if (a.id !== affId) return a;
        const planning_reel = { ...(a.planning_reel || {}) };
        if (!valeur || valeur === 0) delete planning_reel[date];
        else planning_reel[date] = valeur;
        const jours_realises = Object.values(planning_reel).reduce((acc, v) => acc + v, 0);
        return { ...a, planning_reel, jours_realises };
      });
      // Déduit Début réel / Fin réelle depuis l'imputation, pour éviter d'avoir à les saisir en plus.
      const derived = deriverDatesReellesNoeud({ affectations });
      return {
        ...n, affectations,
        date_debut_reel: derived.date_debut_reel || n.date_debut_reel || null,
        date_fin_reel: derived.date_fin_reel || n.date_fin_reel || null,
      };
    });

    wbs = wbs.map((n) => {
      if (n.id !== nodeId) return n;
      const totalReel = n.affectations.reduce((s, a) =>
        s + Object.values(a.planning_reel || {}).reduce((sv, v) => sv + v, 0), 0);
      if (totalReel > 0 && n.statut === 'non_demarre') return { ...n, statut: 'en_cours' };
      return n;
    });

    const propagerStatutParent = (childId) => {
      const parent = wbs.find((n) => wbs.some((c) => c.id === childId && c.parent_id === n.id));
      if (!parent) return;
      const enfants = wbs.filter((n) => n.parent_id === parent.id);
      const tousTermines = enfants.length > 0 && enfants.every((e) => e.statut === 'termine');
      const unEnCours = enfants.some((e) => e.statut === 'en_cours' || e.statut === 'termine');
      let newStatut = parent.statut;
      if (tousTermines) newStatut = 'termine';
      else if (unEnCours && parent.statut === 'non_demarre') newStatut = 'en_cours';
      if (newStatut !== parent.statut) {
        wbs = wbs.map((n) => n.id === parent.id ? { ...n, statut: newStatut } : n);
        propagerStatutParent(parent.id);
      }
    };
    propagerStatutParent(nodeId);

    await saveProjet(projetId, { ...p, wbs });
    get()._touch();
  },

  setChargePlanning: async (projetId, nodeId, affId, date, valeur) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const wbs = p.wbs.map((n) => {
      if (n.id !== nodeId) return n;
      const affectations = n.affectations.map((a) => {
        if (a.id !== affId) return a;
        const planning = { ...(a.planning || {}) };
        if (!valeur || valeur === 0) delete planning[date];
        else planning[date] = valeur;
        const jours_prev = Object.values(planning).reduce((acc, v) => acc + v, 0);
        return { ...a, planning, jours_prev };
      });
      const allDates = affectations.flatMap((a) => Object.keys(a.planning || {})).filter(Boolean);
      const date_debut_prev = allDates.length > 0 ? allDates.sort()[0] : n.date_debut_prev;
      const date_fin_prev   = allDates.length > 0 ? allDates.sort().at(-1) : n.date_fin_prev;
      return { ...n, affectations, date_debut_prev, date_fin_prev };
    });
    await saveProjet(projetId, { ...p, wbs });
    get()._touch();
  },

  deleteAffectation: async (projetId, nodeId, affId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const wbs = p.wbs.map((n) =>
      n.id !== nodeId ? n : { ...n, affectations: n.affectations.filter((a) => a.id !== affId) }
    );
    await saveProjet(projetId, { ...p, wbs });
    get()._touch();
  },

  // Import groupé (évite la race condition du forEach async)
  importWBSNodes: async (projetId, nodes) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const defaults = {
      avancement: 0, statut: 'non_demarre', kanban_colonne: 'backlog',
      affectations: [], description: '',
      date_debut_prev: null, date_fin_prev: null,
      date_debut_reel: null, date_fin_reel: null,
    };
    const newNodes = nodes.map((n) => ({ ...defaults, ...n }));
    await saveProjet(projetId, { ...p, wbs: [...p.wbs, ...newNodes] });
    get()._touch();
  },

  // ── Import WBS pivot (planning historique) ────────────────────────
  // mapping : { [codeRessource]: { action: 'existing', collabId } | { action: 'create', prenom, nom } | { action: 'ignore' } }
  // options : { mode: 'replace'|'merge', importRealise, importDates, pinL1 }
  importWbsPivot: async (projetId, parsedFile, mapping, options = {}) => {
    const { ressources, wbs: taches, realiseMensuel } = parsedFile;
    const { mode = 'merge', importRealise = true, importDates = true, pinL1 = false } = options;
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;

    const STATUT_MAP = { a_faire: 'non_demarre', en_cours: 'en_cours', termine: 'termine', bloque: 'bloque' };
    const KANBAN_MAP = { a_faire: 'todo', en_cours: 'en_cours', termine: 'done', bloque: 'backlog' };

    // 1. Résoudre le mapping ressources → collaborateur (création si demandé)
    const collabIdByCode = {};
    for (const r of ressources) {
      const m = mapping[r.code];
      if (!m || m.action === 'ignore') { collabIdByCode[r.code] = null; continue; }
      if (m.action === 'create') {
        const nouveau = await get().addCollaborateur({ prenom: m.prenom, nom: m.nom, profil: r.profil });
        collabIdByCode[r.code] = nouveau.id;
      } else {
        collabIdByCode[r.code] = m.collabId;
      }
    }

    // 2. TJM du projet pour chaque collaborateur mappé (n'écrase pas un TJM déjà défini)
    const tjm = [...(p.tjm || [])];
    for (const r of ressources) {
      const collabId = collabIdByCode[r.code];
      if (!collabId || tjm.some((t) => t.collaborateur_id === collabId)) continue;
      tjm.push({ collaborateur_id: collabId, montant: r.tjm, devise: 'EUR' });
    }

    // 3. Réalisé mensuel agrégé par tâche source
    const realiseParTache = {};
    if (importRealise) {
      realiseMensuel.forEach((r) => {
        realiseParTache[r.idTache] ??= {};
        realiseParTache[r.idTache][r.mois] = (realiseParTache[r.idTache][r.mois] || 0) + r.jours;
      });
    }

    // 4. Construction de l'arbre L1 → L2 → tâche
    const wbsExistant = mode === 'replace' ? [] : [...(p.wbs || [])];
    const nouveauxNoeuds = [];
    const enfantsDe = (parentId) => [...wbsExistant, ...nouveauxNoeuds].filter((n) => n.parent_id === parentId);

    const l1Map = new Map(); // nom L1 → node (existant réutilisé en mode merge, ou nouveau)
    const l2Map = new Map(); // `${l1}||${l2}` → node
    let noeudsL1 = 0, noeudsL2 = 0, joursRealisesTotal = 0;

    for (const t of taches) {
      let l1Node = l1Map.get(t.wbsL1)
        || wbsExistant.find((n) => n.parent_id === null && n.nom === t.wbsL1);
      if (!l1Node) {
        l1Node = {
          id: uuidv4(), parent_id: null, ordre: enfantsDe(null).length + 1, nom: t.wbsL1,
          description: '', type: 'livrable', niveau: 1,
          date_debut_prev: null, date_fin_prev: null, date_debut_reel: null, date_fin_reel: null,
          avancement: 0, statut: 'non_demarre', kanban_colonne: 'backlog', affectations: [],
          epingle_dashboard: pinL1,
        };
        nouveauxNoeuds.push(l1Node);
        noeudsL1++;
      }
      l1Map.set(t.wbsL1, l1Node);

      let parentTache = l1Node;
      if (t.wbsL2) {
        const cleL2 = `${t.wbsL1}||${t.wbsL2}`;
        let l2Node = l2Map.get(cleL2)
          || wbsExistant.find((n) => n.parent_id === l1Node.id && n.nom === t.wbsL2);
        if (!l2Node) {
          l2Node = {
            id: uuidv4(), parent_id: l1Node.id, ordre: enfantsDe(l1Node.id).length + 1, nom: t.wbsL2,
            description: '', type: 'livrable', niveau: 2,
            date_debut_prev: null, date_fin_prev: null, date_debut_reel: null, date_fin_reel: null,
            avancement: 0, statut: 'non_demarre', kanban_colonne: 'backlog', affectations: [],
          };
          nouveauxNoeuds.push(l2Node);
          noeudsL2++;
        }
        l2Map.set(cleL2, l2Node);
        parentTache = l2Node;
      }

      const collabId = t.ressource ? collabIdByCode[t.ressource] : null;
      const affectations = [];
      if (collabId) {
        const jours_realises_par_mois = realiseParTache[t.id] || {};
        const sommeMensuelle = Object.values(jours_realises_par_mois).reduce((s, v) => s + v, 0);
        const jours_realises = importRealise ? Math.max(sommeMensuelle, t.chargeReelle || 0) : 0;
        affectations.push({
          id: uuidv4(), collaborateur_id: collabId,
          jours_prev: t.chargePrevue || 0,
          jours_realises,
          jours_realises_par_mois,
          planning: {}, planning_reel: {},
        });
        joursRealisesTotal += jours_realises;
      }

      nouveauxNoeuds.push({
        id: uuidv4(), parent_id: parentTache.id, ordre: enfantsDe(parentTache.id).length + 1, nom: t.tache,
        description: t.commentaire || '', type: 'tache', niveau: t.wbsL2 ? 3 : 2,
        date_debut_prev: importDates ? t.debutPrev : null,
        date_fin_prev: importDates ? t.finPrev : null,
        date_debut_reel: importDates ? t.debutReel : null,
        date_fin_reel: importDates ? t.finReel : null,
        avancement: t.statut === 'termine' ? 100 : 0,
        statut: STATUT_MAP[t.statut] || 'non_demarre',
        kanban_colonne: KANBAN_MAP[t.statut] || 'backlog',
        affectations,
        prerequis: t.prerequis || null,
        importRef: t.id,
      });
    }

    await saveProjet(projetId, { ...p, wbs: [...wbsExistant, ...nouveauxNoeuds], tjm });
    get()._touch();
    return { noeudsL1, noeudsL2, taches: taches.length, joursRealises: joursRealisesTotal };
  },

  // Réordonne les enfants d'un parent (drag & drop)
  reorderWBSChildren: async (projetId, parentId, orderedIds) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const wbs = p.wbs.map((n) => {
      const idx = orderedIds.indexOf(n.id);
      if (idx === -1) return n;
      return { ...n, ordre: idx + 1 };
    });
    await saveProjet(projetId, { ...p, wbs });
    get()._touch();
  },

  // ── Milestones ──────────────────────────────────────────────────
  addMilestone: async (projetId, milestone) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const m = { id: uuidv4(), date_reelle: null, statut: 'a_venir', description: '', ...milestone };
    await saveProjet(projetId, { ...p, milestones: [...p.milestones, m] });
    get()._touch();
  },

  updateMilestone: async (projetId, milestoneId, updates) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const milestones = p.milestones.map((m) => m.id === milestoneId ? { ...m, ...updates } : m);
    await saveProjet(projetId, { ...p, milestones });
    get()._touch();
  },

  deleteMilestone: async (projetId, milestoneId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    await saveProjet(projetId, { ...p, milestones: p.milestones.filter((m) => m.id !== milestoneId) });
    get()._touch();
  },

  // ── RIAD (Risques, Issues, Actions, Décisions) ────────────────────
  setEscaladeNiveaux: async (projetId, niveaux) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    await saveProjet(projetId, { ...p, escalade_niveaux: niveaux });
    get()._touch();
  },

  addRiadItem: async (projetId, module, item) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const riad = { risques: [], issues: [], actions: [], decisions: [], ...(p.riad || {}) };
    const list = riad[module] || [];
    const numero = list.reduce((max, it) => Math.max(max, it.numero || 0), 0) + 1;
    const newItem = {
      id: uuidv4(), numero,
      escalade: p.escalade_niveaux?.[0] || '', status: 'ouvert',
      description: '', responsable: '', deadline: null, commentaire: '',
      ...item,
    };
    riad[module] = [...list, newItem];
    await saveProjet(projetId, { ...p, riad });
    get()._touch();
    return newItem;
  },

  updateRiadItem: async (projetId, module, itemId, updates) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const riad = { risques: [], issues: [], actions: [], decisions: [], ...(p.riad || {}) };
    riad[module] = (riad[module] || []).map((it) => it.id === itemId ? { ...it, ...updates } : it);
    await saveProjet(projetId, { ...p, riad });
    get()._touch();
  },

  deleteRiadItem: async (projetId, module, itemId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const riad = { risques: [], issues: [], actions: [], decisions: [], ...(p.riad || {}) };
    riad[module] = (riad[module] || []).filter((it) => it.id !== itemId);
    await saveProjet(projetId, { ...p, riad });
    get()._touch();
  },

  // ── Stakeholders ────────────────────────────────────────────────
  addStakeholder: async (projetId, stakeholder) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const sh = {
      id: uuidv4(), ordre: 999, role: '', nom: '', organisation: '',
      influence: 3, interet: 3, success_definition: '', communication_strategy: '',
      empathy_notes: '', checkin_frequency: 'mensuel', derniere_interaction: null,
      notes_generales: '', statut: 'actif', ...stakeholder,
    };
    sh.quadrant = calculerQuadrant(sh.influence, sh.interet);
    await saveProjet(projetId, { ...p, stakeholders: [...(p.stakeholders || []), sh] });
    get()._touch();
    return sh;
  },

  updateStakeholder: async (projetId, stakeholderId, updates) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const stakeholders = (p.stakeholders || []).map((sh) => {
      if (sh.id !== stakeholderId) return sh;
      const updated = { ...sh, ...updates };
      updated.quadrant = calculerQuadrant(updated.influence, updated.interet);
      return updated;
    });
    await saveProjet(projetId, { ...p, stakeholders });
    get()._touch();
  },

  deleteStakeholder: async (projetId, stakeholderId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    await saveProjet(projetId, {
      ...p,
      stakeholders: (p.stakeholders || []).filter((sh) => sh.id !== stakeholderId),
    });
    get()._touch();
  },

  // ── Commandes ───────────────────────────────────────────────────
  // Deux usages du même champ `commandes` selon projet.type :
  //  - BUILD : regroupement facturation existant { numero, collaborateur_ids, notes }
  //  - RUN   : bon de commande annuel { numero, lot, annee, lignes: [{id, collabId, pu, nbjCommande}] }
  addCommande: async (projetId, commande) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const c = {
      id: uuidv4(), numero: '', collaborateur_ids: [], notes: '',
      lot: null, annee: new Date().getFullYear(), lignes: [],
      dateCreation: new Date().toISOString(),
      ...commande,
    };
    await saveProjet(projetId, { ...p, commandes: [...(p.commandes || []), c] });
    get()._touch();
    return c;
  },

  updateCommande: async (projetId, commandeId, updates) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const commandes = (p.commandes || []).map((c) => c.id === commandeId ? { ...c, ...updates } : c);
    await saveProjet(projetId, { ...p, commandes });
    get()._touch();
  },

  deleteCommande: async (projetId, commandeId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const cmd = (p.commandes || []).find((c) => c.id === commandeId);
    const ligneIds = new Set((cmd?.lignes || []).map((l) => l.id));
    const aDeLaConso = Object.values(p.consoMensuelle || {})
      .some((byLigne) => Object.keys(byLigne).some((ligneId) => ligneIds.has(ligneId) && byLigne[ligneId] > 0));
    if (aDeLaConso) {
      throw new Error('Impossible de supprimer cette commande : elle a de la consommation saisie. Videz-la d\'abord.');
    }
    await saveProjet(projetId, { ...p, commandes: (p.commandes || []).filter((c) => c.id !== commandeId) });
    get()._touch();
  },

  // ── Suivi RUN — conso mensuelle par ligne de commande ─────────────
  setConsoMensuelleRun: async (projetId, month, ligneId, nbj) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    if ((p.moisVerrouilles || []).includes(month)) {
      throw new Error(`Le mois ${month} est verrouillé (facture émise) : saisie impossible.`);
    }
    const consoMensuelle = { ...(p.consoMensuelle || {}) };
    const byLigne = { ...(consoMensuelle[month] || {}) };
    if (!nbj || nbj === 0) delete byLigne[ligneId];
    else byLigne[ligneId] = nbj;
    if (Object.keys(byLigne).length === 0) delete consoMensuelle[month];
    else consoMensuelle[month] = byLigne;
    await saveProjet(projetId, { ...p, consoMensuelle });
    get()._touch();
  },

  affecterConsoNonAffectee: async (projetId, month, collabId, ligneId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const consoNonAffectee = { ...(p.consoNonAffectee || {}) };
    const byCollabMois = { ...(consoNonAffectee[month] || {}) };
    const nbj = byCollabMois[collabId];
    if (!nbj) return;
    delete byCollabMois[collabId];
    if (Object.keys(byCollabMois).length === 0) delete consoNonAffectee[month];
    else consoNonAffectee[month] = byCollabMois;

    const consoMensuelle = { ...(p.consoMensuelle || {}) };
    const byLigne = { ...(consoMensuelle[month] || {}) };
    byLigne[ligneId] = (byLigne[ligneId] || 0) + nbj;
    consoMensuelle[month] = byLigne;

    await saveProjet(projetId, { ...p, consoMensuelle, consoNonAffectee });
    get()._touch();
  },

  // ── Factures ────────────────────────────────────────────────────
  addFacture: async (projetId, facture) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const params = p.facturation_params || { tva: 20, delai_paiement: 30, prochain_numero: 1 };
    const year = new Date().getFullYear();
    const numero = `FAC-${year}-${String(params.prochain_numero).padStart(3, '0')}`;
    const f = {
      id: uuidv4(), numero, statut: 'brouillon', lignes: [], tva: params.tva,
      date_emission: null, date_echeance: null, date_paiement: null,
      reference_client: '', notes: '', created_at: new Date().toISOString(), ...facture,
    };
    await saveProjet(projetId, {
      ...p,
      factures: [...(p.factures || []), f],
      facturation_params: { ...params, prochain_numero: params.prochain_numero + 1 },
    });
    get()._touch();
  },

  updateFacture: async (projetId, factureId, updates) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const facture = (p.factures || []).find((f) => f.id === factureId);
    const factures = (p.factures || []).map((f) => f.id === factureId ? { ...f, ...updates } : f);

    // RUN : la facturation d'un mois verrouille sa saisie ; un retour en brouillon la déverrouille.
    let moisVerrouilles = p.moisVerrouilles || [];
    if (p.type === 'RUN' && facture?.mois && updates.statut && updates.statut !== facture.statut) {
      if (updates.statut === 'brouillon') {
        moisVerrouilles = moisVerrouilles.filter((m) => m !== facture.mois);
      } else if (!moisVerrouilles.includes(facture.mois)) {
        moisVerrouilles = [...moisVerrouilles, facture.mois];
      }
    }

    await saveProjet(projetId, { ...p, factures, moisVerrouilles });
    get()._touch();
  },

  deleteFacture: async (projetId, factureId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    await saveProjet(projetId, { ...p, factures: (p.factures || []).filter((f) => f.id !== factureId) });
    get()._touch();
  },

  // Génère/actualise (tant que brouillon) la facture RUN du mois à partir de la conso saisie.
  genererFactureRunMois: async (projetId, month) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    if ((p.moisVerrouilles || []).includes(month)) {
      throw new Error(`Le mois ${month} est déjà facturé.`);
    }
    const collaborateurs = get().collaborateurs;
    const byLigne = (p.consoMensuelle || {})[month] || {};
    const lignes = [];
    for (const cmd of (p.commandes || [])) {
      for (const l of (cmd.lignes || [])) {
        const nbj = byLigne[l.id] || 0;
        if (nbj <= 0) continue;
        const c = collaborateurs.find((x) => x.id === l.collabId);
        const nom = c ? `${c.prenom} ${c.nom}` : 'Inconnu';
        const description = `${nom} — ${cmd.numero}${cmd.lot ? ' · ' + cmd.lot : ''}`;
        lignes.push({ id: uuidv4(), collaborateur_id: l.collabId, collaborateur_nom: nom, jours: nbj, tjm: l.pu, montant: nbj * l.pu, description });
      }
    }
    if (lignes.length === 0) return;
    const existing = (p.factures || []).find((f) => f.mois === month);
    if (existing) {
      await get().updateFacture(projetId, existing.id, { lignes });
    } else {
      await get().addFacture(projetId, { mois: month, lignes });
    }
  },

  // ── Import CRA (TM1 « Planning Activité ») ────────────────────────
  // payload : [{ mission, month, jours, collabId, consultantName,
  //              target: {kind:'existing', projetId} | {kind:'create', nom, type} }]
  applyCraImport: async (payload, { source } = {}) => {
    const state = get();
    let projectsCreated = 0;

    // Copie de travail : projets existants + projets créés ci-dessous (pas encore
    // reflétés dans le store via la souscription Firestore temps réel).
    const projetsById = {};
    state.projets.forEach((p) => { projetsById[p.id] = p; });

    const createdByName = {};
    for (const e of payload) {
      if (e.target.kind === 'create' && !createdByName[e.target.nom]) {
        const projet = await state.addProjet({ nom: e.target.nom, type: e.target.type, statut: 'actif' });
        createdByName[e.target.nom] = projet.id;
        projetsById[projet.id] = projet;
        projectsCreated++;
      }
    }
    const targetId = (e) => e.target.kind === 'existing' ? e.target.projetId : createdByName[e.target.nom];

    // Regroupement projet → mois → collab, additif entre missions fusionnées dans CET import.
    const grouped = {};
    for (const e of payload) {
      const pid = targetId(e);
      grouped[pid] ??= {};
      grouped[pid][e.month] ??= {};
      grouped[pid][e.month][e.collabId] = (grouped[pid][e.month][e.collabId] || 0) + e.jours;
    }

    // Refus si un des mois visés est verrouillé (facture émise) sur son projet.
    const refus = [];
    for (const [pid, months] of Object.entries(grouped)) {
      const p = projetsById[pid];
      const locked = new Set(p?.moisVerrouilles || []);
      const bloques = Object.keys(months).filter((m) => locked.has(m));
      if (bloques.length) refus.push(`${p?.nom || pid} : ${bloques.join(', ')}`);
    }
    if (refus.length) {
      throw new Error(`Import refusé — mois verrouillés : ${refus.join(' ; ')}`);
    }

    // Écriture, mode replace-month : pour chaque (mois, clé) touché par l'import,
    // la valeur agrégée remplace l'existant (idempotent en cas de ré-import).
    for (const [pid, months] of Object.entries(grouped)) {
      const p = projetsById[pid];
      if (!p) continue;
      let consoMensuelle = { ...(p.consoMensuelle || {}) };
      let consoNonAffectee = { ...(p.consoNonAffectee || {}) };
      let totalJours = 0;

      for (const [month, byCollab] of Object.entries(months)) {
        totalJours += Object.values(byCollab).reduce((a, b) => a + b, 0);
        if (p.type === 'RUN') {
          const byLigne = { ...(consoMensuelle[month] || {}) };
          const byCollabNonAff = { ...(consoNonAffectee[month] || {}) };
          const annee = Number(month.slice(0, 4));
          for (const [collabId, jours] of Object.entries(byCollab)) {
            const lignesActives = (p.commandes || [])
              .filter((c) => c.annee === annee)
              .flatMap((c) => c.lignes || [])
              .filter((l) => l.collabId === collabId);
            if (lignesActives.length === 1) {
              byLigne[lignesActives[0].id] = jours;
            } else {
              byCollabNonAff[collabId] = jours;
            }
          }
          consoMensuelle = { ...consoMensuelle, [month]: byLigne };
          consoNonAffectee = { ...consoNonAffectee, [month]: byCollabNonAff };
        } else {
          // BUILD : grain projet × mois × collab (n'alimente pas la ventilation WBS).
          consoMensuelle = { ...consoMensuelle, [month]: { ...byCollab } };
        }
      }

      const importsCra = [
        ...(p.importsCra || []),
        { source, importedAt: Date.now(), months: Object.keys(months), totalJours },
      ];
      await saveProjet(pid, { ...p, consoMensuelle, consoNonAffectee, importsCra });
    }

    get()._touch();
    return { entries: payload.length, projectsCreated };
  },

  // ── Import/Export ────────────────────────────────────────────────
  importAll: async (data) => {
    const collabs = data.collaborateurs || [];
    const projets = (data.projets || []).map(migrateProjet);
    await Promise.all(collabs.map((c) => saveCollaborateur(c.id, c)));
    await Promise.all(projets.map((p) => saveProjet(p.id, p)));
    get()._touch();
  },

  // ── Admin — Gestion utilisateurs ────────────────────────────────
  updateUserAdmin: async (uid, updates) => {
    await patchUser(uid, updates);
    get()._touch();
  },

  deactivateUserAdmin: async (uid) => {
    await patchUser(uid, { actif: false });
    get()._touch();
  },

  activateUserAdmin: async (uid) => {
    await patchUser(uid, { actif: true });
    get()._touch();
  },
}));

export default useAppStore;
export { exportData, importData };

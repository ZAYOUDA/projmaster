import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import {
  subscribeCollaborateurs, saveCollaborateur, patchCollaborateur, removeCollaborateur,
  subscribeProjets, saveProjet, patchProjet, removeProjet,
  subscribeUsers, subscribeUserDoc, saveUser, patchUser,
} from '../firebase/firestore';
import { defaultData } from '../data/defaultData';
import { exportData, importData } from '../data/storage';

function calculerQuadrant(influence, interet) {
  if (influence >= 3 && interet >= 3) return 'gerer_activement';
  if (influence >= 3 && interet < 3)  return 'garder_satisfait';
  if (influence < 3  && interet >= 3) return 'informer';
  return 'surveiller';
}

function migrateProjet(p) {
  return {
    stakeholders: [],
    factures: [],
    commandes: [],
    facturation_params: { tva: 20, delai_paiement: 30, prochain_numero: 1 },
    reporting_snapshots: [],
    ...p,
    wbs: (p.wbs || []).map((n) => ({
      ...n,
      affectations: (n.affectations || []).map((a) => {
        const base = { jours_realises_par_mois: {}, ...a };
        const fromPlanning = Object.values(base.planning_reel || {}).reduce((acc, v) => acc + v, 0);
        const fromMois = Object.values(base.jours_realises_par_mois || {}).reduce((acc, v) => acc + v, 0);
        const jours_realises = Math.max(fromPlanning, fromMois, base.jours_realises || 0);
        return { ...base, jours_realises };
      }),
    })),
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
      couleur,
      statut: 'actif',
      wbs: [],
      milestones: [],
      risques: [],
      tjm: [],
      stakeholders: [],
      factures: [],
      commandes: [],
      facturation_params: { tva: 20, delai_paiement: 30, prochain_numero: 1 },
      reporting_snapshots: [],
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
      return { ...n, affectations };
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
      return { ...n, affectations };
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

  // ── Risques ─────────────────────────────────────────────────────
  addRisque: async (projetId, risque) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const r = { id: uuidv4(), statut: 'ouvert', date_echeance: null, ...risque };
    await saveProjet(projetId, { ...p, risques: [...p.risques, r] });
    get()._touch();
  },

  updateRisque: async (projetId, risqueId, updates) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const risques = p.risques.map((r) => r.id === risqueId ? { ...r, ...updates } : r);
    await saveProjet(projetId, { ...p, risques });
    get()._touch();
  },

  deleteRisque: async (projetId, risqueId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    await saveProjet(projetId, { ...p, risques: p.risques.filter((r) => r.id !== risqueId) });
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
  addCommande: async (projetId, commande) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    const c = { id: uuidv4(), numero: '', collaborateur_ids: [], notes: '', ...commande };
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
    await saveProjet(projetId, { ...p, commandes: (p.commandes || []).filter((c) => c.id !== commandeId) });
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
    const factures = (p.factures || []).map((f) => f.id === factureId ? { ...f, ...updates } : f);
    await saveProjet(projetId, { ...p, factures });
    get()._touch();
  },

  deleteFacture: async (projetId, factureId) => {
    const p = get().projets.find((p) => p.id === projetId);
    if (!p) return;
    await saveProjet(projetId, { ...p, factures: (p.factures || []).filter((f) => f.id !== factureId) });
    get()._touch();
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

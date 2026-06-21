import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { loadData, saveData } from '../data/storage';
import { defaultData } from '../data/defaultData';

const useAppStore = create((set, get) => ({
  collaborateurs: [],
  projets: [],
  savedAt: null,

  init: async () => {
    const data = await loadData();
    if (data && (data.collaborateurs?.length || data.projets?.length)) {
      set({ collaborateurs: data.collaborateurs || [], projets: data.projets || [] });
    } else {
      const saved = await saveData(defaultData);
      set({ collaborateurs: defaultData.collaborateurs, projets: defaultData.projets, savedAt: saved.meta.lastSaved });
    }
  },

  _save: async () => {
    const { collaborateurs, projets } = get();
    const saved = await saveData({ collaborateurs, projets });
    set({ savedAt: saved.meta.lastSaved });
  },

  // ── Collaborateurs ──────────────────────────────────────────────
  addCollaborateur: (collab) => {
    const newCollab = {
      ...collab,
      id: uuidv4(),
      initiales: collab.initiales || `${collab.prenom[0]}${collab.nom[0]}`.toUpperCase(),
      actif: true,
      conges: collab.conges || {},
    };
    set((s) => ({ collaborateurs: [...s.collaborateurs, newCollab] }));
    get()._save();
    return newCollab;
  },

  updateCollaborateur: (id, updates) => {
    set((s) => ({
      collaborateurs: s.collaborateurs.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
    get()._save();
  },

  toggleCollaborateurActif: (id) => {
    set((s) => ({
      collaborateurs: s.collaborateurs.map((c) =>
        c.id === id ? { ...c, actif: !c.actif } : c
      ),
    }));
    get()._save();
  },

  // ── Congés ──────────────────────────────────────────────────────
  setConge: (collabId, date, valeur) => {
    set((s) => ({
      collaborateurs: s.collaborateurs.map((c) => {
        if (c.id !== collabId) return c;
        const conges = { ...(c.conges || {}) };
        if (!valeur || valeur === 0) delete conges[date];
        else conges[date] = valeur;
        return { ...c, conges };
      }),
    }));
    get()._save();
  },

  // ── Projets ─────────────────────────────────────────────────────
  addProjet: (projet) => {
    const PROJ_COLORS = ['#378ADD', '#1D9E75', '#BA7517', '#D4537E', '#7F77DD', '#D85A30', '#888780', '#5DCAA5'];
    const usedColors = get().projets.map((p) => p.couleur);
    const couleur = PROJ_COLORS.find((c) => !usedColors.includes(c)) || PROJ_COLORS[0];
    const newProjet = {
      id: uuidv4(),
      couleur,
      statut: 'actif',
      wbs: [],
      milestones: [],
      risques: [],
      tjm: [],
      ...projet,
    };
    set((s) => ({ projets: [...s.projets, newProjet] }));
    get()._save();
    return newProjet;
  },

  updateProjet: (id, updates) => {
    set((s) => ({
      projets: s.projets.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
    get()._save();
  },

  deleteProjet: (id) => {
    set((s) => ({ projets: s.projets.filter((p) => p.id !== id) }));
    get()._save();
  },

  // ── TJM ─────────────────────────────────────────────────────────
  setTJM: (projetId, collaborateurId, montant) => {
    set((s) => ({
      projets: s.projets.map((p) => {
        if (p.id !== projetId) return p;
        const exists = p.tjm.find((t) => t.collaborateur_id === collaborateurId);
        const tjm = exists
          ? p.tjm.map((t) => t.collaborateur_id === collaborateurId ? { ...t, montant } : t)
          : [...p.tjm, { collaborateur_id: collaborateurId, montant, devise: 'EUR' }];
        return { ...p, tjm };
      }),
    }));
    get()._save();
  },

  removeTJM: (projetId, collaborateurId) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : { ...p, tjm: p.tjm.filter((t) => t.collaborateur_id !== collaborateurId) }
      ),
    }));
    get()._save();
  },

  // ── WBS ─────────────────────────────────────────────────────────
  addWBSNode: (projetId, node) => {
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
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : { ...p, wbs: [...p.wbs, newNode] }
      ),
    }));
    get()._save();
    return newNode;
  },

  updateWBSNode: (projetId, nodeId, updates) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          wbs: p.wbs.map((n) => n.id === nodeId ? { ...n, ...updates } : n),
        }
      ),
    }));
    get()._save();
  },

  deleteWBSNode: (projetId, nodeId) => {
    set((s) => ({
      projets: s.projets.map((p) => {
        if (p.id !== projetId) return p;
        // Remove node and all descendants
        const toDelete = new Set();
        const collect = (id) => {
          toDelete.add(id);
          p.wbs.filter((n) => n.parent_id === id).forEach((c) => collect(c.id));
        };
        collect(nodeId);
        return { ...p, wbs: p.wbs.filter((n) => !toDelete.has(n.id)) };
      }),
    }));
    get()._save();
  },

  // ── Affectations ────────────────────────────────────────────────
  addAffectation: (projetId, nodeId, affectation) => {
    const newAff = { id: uuidv4(), jours_prev: 0, jours_realises: 0, planning: {}, planning_reel: {}, ...affectation };
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          wbs: p.wbs.map((n) =>
            n.id !== nodeId ? n : { ...n, affectations: [...n.affectations, newAff] }
          ),
        }
      ),
    }));
    get()._save();
  },

  updateAffectation: (projetId, nodeId, affId, updates) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          wbs: p.wbs.map((n) =>
            n.id !== nodeId ? n : {
              ...n,
              affectations: n.affectations.map((a) => a.id === affId ? { ...a, ...updates } : a),
            }
          ),
        }
      ),
    }));
    get()._save();
  },

  setChargePlanningReel: (projetId, nodeId, affId, date, valeur) => {
    set((s) => ({
      projets: s.projets.map((p) => {
        if (p.id !== projetId) return p;
        return {
          ...p,
          wbs: p.wbs.map((n) => {
            if (n.id !== nodeId) return n;
            const affectations = n.affectations.map((a) => {
              if (a.id !== affId) return a;
              const planning_reel = { ...(a.planning_reel || {}) };
              if (!valeur || valeur === 0) delete planning_reel[date];
              else planning_reel[date] = valeur;
              const jours_realises = Object.values(planning_reel).reduce((s, v) => s + v, 0);
              return { ...a, planning_reel, jours_realises };
            });
            return { ...n, affectations };
          }),
        };
      }),
    }));
    get()._save();
  },

  setChargePlanning: (projetId, nodeId, affId, date, valeur) => {
    set((s) => ({
      projets: s.projets.map((p) => {
        if (p.id !== projetId) return p;
        return {
          ...p,
          wbs: p.wbs.map((n) => {
            if (n.id !== nodeId) return n;
            const affectations = n.affectations.map((a) => {
              if (a.id !== affId) return a;
              const planning = { ...(a.planning || {}) };
              if (!valeur || valeur === 0) {
                delete planning[date];
              } else {
                planning[date] = valeur;
              }
              // Recalcul jours_prev = somme de toutes les valeurs
              const jours_prev = Object.values(planning).reduce((s, v) => s + v, 0);
              return { ...a, planning, jours_prev };
            });
            // Recalcul dates prévisionnelles depuis TOUTES les affectations
            const allDates = affectations.flatMap((a) => Object.keys(a.planning || {})).filter(Boolean);
            const date_debut_prev = allDates.length > 0 ? allDates.sort()[0] : n.date_debut_prev;
            const date_fin_prev   = allDates.length > 0 ? allDates.sort().at(-1) : n.date_fin_prev;
            return { ...n, affectations, date_debut_prev, date_fin_prev };
          }),
        };
      }),
    }));
    get()._save();
  },

  deleteAffectation: (projetId, nodeId, affId) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          wbs: p.wbs.map((n) =>
            n.id !== nodeId ? n : { ...n, affectations: n.affectations.filter((a) => a.id !== affId) }
          ),
        }
      ),
    }));
    get()._save();
  },

  // ── Milestones ──────────────────────────────────────────────────
  addMilestone: (projetId, milestone) => {
    const m = { id: uuidv4(), date_reelle: null, statut: 'a_venir', description: '', ...milestone };
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : { ...p, milestones: [...p.milestones, m] }
      ),
    }));
    get()._save();
  },

  updateMilestone: (projetId, milestoneId, updates) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          milestones: p.milestones.map((m) => m.id === milestoneId ? { ...m, ...updates } : m),
        }
      ),
    }));
    get()._save();
  },

  deleteMilestone: (projetId, milestoneId) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : { ...p, milestones: p.milestones.filter((m) => m.id !== milestoneId) }
      ),
    }));
    get()._save();
  },

  // ── Risques ─────────────────────────────────────────────────────
  addRisque: (projetId, risque) => {
    const r = { id: uuidv4(), statut: 'ouvert', date_echeance: null, ...risque };
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : { ...p, risques: [...p.risques, r] }
      ),
    }));
    get()._save();
  },

  updateRisque: (projetId, risqueId, updates) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          risques: p.risques.map((r) => r.id === risqueId ? { ...r, ...updates } : r),
        }
      ),
    }));
    get()._save();
  },

  deleteRisque: (projetId, risqueId) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : { ...p, risques: p.risques.filter((r) => r.id !== risqueId) }
      ),
    }));
    get()._save();
  },

  // ── Import/Export ────────────────────────────────────────────────
  importAll: (data) => {
    set({ collaborateurs: data.collaborateurs || [], projets: data.projets || [] });
    get()._save();
  },
}));

export default useAppStore;

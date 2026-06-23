import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { loadData, saveData } from '../data/storage';
import { defaultData } from '../data/defaultData';

function calculerQuadrant(influence, interet) {
  if (influence >= 3 && interet >= 3) return 'gerer_activement';
  if (influence >= 3 && interet < 3)  return 'garder_satisfait';
  if (influence < 3  && interet >= 3) return 'informer';
  return 'surveiller';
}

// V1 → V2 migration: add missing fields without destroying existing data
function migrateData(data) {
  const projets = (data.projets || []).map((p) => ({
    stakeholders: [],
    factures: [],
    commandes: [],
    facturation_params: { tva: 20, delai_paiement: 30, prochain_numero: 1 },
    ...p,
    wbs: (p.wbs || []).map((n) => ({
      ...n,
      affectations: (n.affectations || []).map((a) => ({
        jours_realises_par_mois: {},
        ...a,
      })),
    })),
  }));
  return { ...data, projets };
}

const useAppStore = create((set, get) => ({
  collaborateurs: [],
  projets: [],
  savedAt: null,

  init: async () => {
    const data = await loadData();
    if (data && (data.collaborateurs?.length || data.projets?.length)) {
      const migrated = migrateData(data);
      set({ collaborateurs: migrated.collaborateurs || [], projets: migrated.projets || [] });
    } else {
      const d = migrateData(defaultData);
      const saved = await saveData(d);
      set({ collaborateurs: d.collaborateurs, projets: d.projets, savedAt: saved.meta.lastSaved });
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
      stakeholders: [],
      factures: [],
      commandes: [],
      facturation_params: { tva: 20, delai_paiement: 30, prochain_numero: 1 },
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
    const newAff = {
      id: uuidv4(),
      jours_prev: 0,
      jours_realises: 0,
      jours_realises_par_mois: {},
      planning: {},
      planning_reel: {},
      ...affectation,
    };
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

  // Saisie mensuelle des jours réalisés (V2)
  setChargeRealiseMois: (projetId, nodeId, affId, mois, jours) => {
    set((s) => ({
      projets: s.projets.map((p) => {
        if (p.id !== projetId) return p;
        return {
          ...p,
          wbs: p.wbs.map((n) => {
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
          }),
        };
      }),
    }));
    get()._save();
  },

  setChargePlanningReel: (projetId, nodeId, affId, date, valeur) => {
    set((s) => ({
      projets: s.projets.map((p) => {
        if (p.id !== projetId) return p;

        // 1. Mettre à jour la cellule réelle
        let wbs = p.wbs.map((n) => {
          if (n.id !== nodeId) return n;
          const affectations = n.affectations.map((a) => {
            if (a.id !== affId) return a;
            const planning_reel = { ...(a.planning_reel || {}) };
            if (!valeur || valeur === 0) delete planning_reel[date];
            else planning_reel[date] = valeur;
            return { ...a, planning_reel };
          });
          return { ...n, affectations };
        });

        // 2. Recalculer le statut de la sous-tâche modifiée
        wbs = wbs.map((n) => {
          if (n.id !== nodeId) return n;
          const totalReel = n.affectations.reduce((s, a) =>
            s + Object.values(a.planning_reel || {}).reduce((sv, v) => sv + v, 0), 0);
          if (totalReel > 0 && n.statut === 'non_demarre') return { ...n, statut: 'en_cours' };
          return n;
        });

        // 3. Remonter le statut au(x) parent(s)
        const node = wbs.find((n) => n.id === nodeId);
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
            propagerStatutParent(parent.id); // remonte encore si besoin
          }
        };
        if (node) propagerStatutParent(nodeId);

        return { ...p, wbs };
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
              const jours_prev = Object.values(planning).reduce((acc, v) => acc + v, 0);
              return { ...a, planning, jours_prev };
            });
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

  // ── Stakeholders ────────────────────────────────────────────────
  addStakeholder: (projetId, stakeholder) => {
    const sh = {
      id: uuidv4(),
      ordre: 999,
      role: '',
      nom: '',
      organisation: '',
      influence: 3,
      interet: 3,
      success_definition: '',
      communication_strategy: '',
      empathy_notes: '',
      checkin_frequency: 'mensuel',
      derniere_interaction: null,
      notes_generales: '',
      statut: 'actif',
      ...stakeholder,
    };
    sh.quadrant = calculerQuadrant(sh.influence, sh.interet);
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : { ...p, stakeholders: [...(p.stakeholders || []), sh] }
      ),
    }));
    get()._save();
    return sh;
  },

  updateStakeholder: (projetId, stakeholderId, updates) => {
    set((s) => ({
      projets: s.projets.map((p) => {
        if (p.id !== projetId) return p;
        return {
          ...p,
          stakeholders: (p.stakeholders || []).map((sh) => {
            if (sh.id !== stakeholderId) return sh;
            const updated = { ...sh, ...updates };
            updated.quadrant = calculerQuadrant(updated.influence, updated.interet);
            return updated;
          }),
        };
      }),
    }));
    get()._save();
  },

  deleteStakeholder: (projetId, stakeholderId) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          stakeholders: (p.stakeholders || []).filter((sh) => sh.id !== stakeholderId),
        }
      ),
    }));
    get()._save();
  },

  // ── Commandes (Bons de commande) ────────────────────────────────
  addCommande: (projetId, commande) => {
    const c = { id: uuidv4(), numero: '', collaborateur_ids: [], notes: '', ...commande };
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : { ...p, commandes: [...(p.commandes || []), c] }
      ),
    }));
    get()._save();
    return c;
  },

  updateCommande: (projetId, commandeId, updates) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          commandes: (p.commandes || []).map((c) => c.id === commandeId ? { ...c, ...updates } : c),
        }
      ),
    }));
    get()._save();
  },

  deleteCommande: (projetId, commandeId) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          commandes: (p.commandes || []).filter((c) => c.id !== commandeId),
        }
      ),
    }));
    get()._save();
  },

  // ── Factures ────────────────────────────────────────────────────
  addFacture: (projetId, facture) => {
    set((s) => ({
      projets: s.projets.map((p) => {
        if (p.id !== projetId) return p;
        const params = p.facturation_params || { tva: 20, delai_paiement: 30, prochain_numero: 1 };
        const year = new Date().getFullYear();
        const numero = `FAC-${year}-${String(params.prochain_numero).padStart(3, '0')}`;
        const f = {
          id: uuidv4(),
          numero,
          statut: 'brouillon',
          lignes: [],
          tva: params.tva,
          date_emission: null,
          date_echeance: null,
          date_paiement: null,
          reference_client: '',
          notes: '',
          created_at: new Date().toISOString(),
          ...facture,
        };
        return {
          ...p,
          factures: [...(p.factures || []), f],
          facturation_params: { ...params, prochain_numero: params.prochain_numero + 1 },
        };
      }),
    }));
    get()._save();
  },

  updateFacture: (projetId, factureId, updates) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          factures: (p.factures || []).map((f) => f.id === factureId ? { ...f, ...updates } : f),
        }
      ),
    }));
    get()._save();
  },

  deleteFacture: (projetId, factureId) => {
    set((s) => ({
      projets: s.projets.map((p) =>
        p.id !== projetId ? p : {
          ...p,
          factures: (p.factures || []).filter((f) => f.id !== factureId),
        }
      ),
    }));
    get()._save();
  },

  // ── Import/Export ────────────────────────────────────────────────
  importAll: (data) => {
    const migrated = migrateData({ collaborateurs: data.collaborateurs || [], projets: data.projets || [] });
    set({ collaborateurs: migrated.collaborateurs, projets: migrated.projets });
    get()._save();
  },
}));

export default useAppStore;

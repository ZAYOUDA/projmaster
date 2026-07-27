import { describe, it, expect } from 'vitest';
import {
  calculerEVMProjet, calculerEVMPortefeuille,
  calculerEarnedSchedule, detecterAvancementNonAJour,
} from './evmCalculs';

const tjm = [{ collaborateur_id: 'c1', montant: 500 }];

function projetBase(overrides = {}) {
  return {
    type: 'BUILD',
    tjm,
    wbs: [],
    ...overrides,
  };
}

describe('calculerEVMProjet', () => {
  it("retourne null pour un projet RUN (EVM non applicable)", () => {
    expect(calculerEVMProjet(projetBase({ type: 'RUN' }))).toBeNull();
  });

  it('calcule BAC/AC/EV via avancement manuel, sans planning journalier ni dates', () => {
    const projet = projetBase({
      wbs: [{
        id: 't1', parent_id: null, avancement: 50,
        date_debut_prev: null, date_fin_prev: null,
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 6 }],
      }],
    });
    const r = calculerEVMProjet(projet);
    expect(r.bac).toBe(5000); // 10j × 500
    expect(r.ac).toBe(3000);  // 6j × 500
    expect(r.ev).toBe(2500);  // 50% × 5000
    expect(r.pv).toBe(0);     // pas de dates ni planning → PV inconnue
    expect(r.cpi).toBeCloseTo(2500 / 3000);
    expect(r.spi).toBeNull(); // pv = 0 → indéterminé
  });

  it('calcule PV via planning journalier (jours planifiés jusqu\'à la date de référence)', () => {
    const projet = projetBase({
      wbs: [{
        id: 't1', parent_id: null, avancement: 0,
        affectations: [{
          collaborateur_id: 'c1', jours_prev: 4, jours_realises: 0,
          planning: { '2026-07-01': 1, '2026-07-02': 1, '2026-07-10': 2 },
        }],
      }],
    });
    const r = calculerEVMProjet(projet, new Date('2026-07-05'));
    // Seuls 2026-07-01 et 07-02 sont <= la date de référence → 2j × 500
    expect(r.pv).toBe(1000);
  });

  it('calcule PV via répartition linéaire (fallback) entre date_debut_prev et date_fin_prev', () => {
    const projet = projetBase({
      wbs: [{
        id: 't1', parent_id: null, avancement: 0,
        date_debut_prev: '2026-01-01', date_fin_prev: '2026-01-11',
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 0 }],
      }],
    });
    // À mi-parcours (5 des 10 jours de durée) → ~50% du BAC (5000)
    const r = calculerEVMProjet(projet, new Date('2026-01-06'));
    expect(r.bac).toBe(5000);
    expect(r.pv).toBeCloseTo(2500, -1);
  });

  it("n'agrège que les feuilles (les nœuds parents ne comptent pas deux fois)", () => {
    const projet = projetBase({
      wbs: [
        { id: 'parent', parent_id: null, avancement: 0, affectations: [] },
        {
          id: 'enfant', parent_id: 'parent', avancement: 100,
          affectations: [{ collaborateur_id: 'c1', jours_prev: 2, jours_realises: 2 }],
        },
      ],
    });
    const r = calculerEVMProjet(projet);
    expect(r.bac).toBe(1000);
    expect(r.ev).toBe(1000);
  });

  it('cpi est null si AC = 0 (rien de dépensé)', () => {
    const projet = projetBase({
      wbs: [{
        id: 't1', parent_id: null, avancement: 0,
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 0 }],
      }],
    });
    expect(calculerEVMProjet(projet).cpi).toBeNull();
  });
});

describe('calculerEVMPortefeuille', () => {
  it('somme EV/AC/PV de plusieurs projets BUILD et ignore les projets RUN', () => {
    const p1 = projetBase({
      wbs: [{
        id: 't1', parent_id: null, avancement: 100,
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 10 }],
      }],
    });
    const p2 = projetBase({ type: 'RUN' });
    const p3 = projetBase({
      wbs: [{
        id: 't1', parent_id: null, avancement: 50,
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 10 }],
      }],
    });
    const r = calculerEVMPortefeuille([p1, p2, p3]);
    expect(r.ac).toBe(10000); // (10 + 10) × 500
    expect(r.ev).toBe(7500);  // 100%×5000 + 50%×5000
    expect(r.cpi).toBeCloseTo(7500 / 10000);
  });
});

describe('calculerEarnedSchedule', () => {
  it('retourne null pour un projet RUN', () => {
    expect(calculerEarnedSchedule(projetBase({ type: 'RUN' }))).toBeNull();
  });

  it('retourne null si aucune feuille n\'a de date_debut_prev', () => {
    const projet = projetBase({
      wbs: [{ id: 't1', parent_id: null, avancement: 50, date_debut_prev: null, date_fin_prev: null, affectations: [] }],
    });
    expect(calculerEarnedSchedule(projet)).toBeNull();
  });

  it('spiT ≈ 1 quand le rythme réel correspond exactement au plan (pas de retard)', () => {
    const projet = projetBase({
      wbs: [{
        id: 't1', parent_id: null, avancement: 50,
        date_debut_prev: '2026-01-01', date_fin_prev: '2026-01-11',
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 5 }],
      }],
    });
    // À mi-parcours (jour 5 sur 10), avancement 50% = exactement ce qui était prévu à cette date.
    const r = calculerEarnedSchedule(projet, new Date('2026-01-06'));
    expect(r.at).toBeCloseTo(5, 0);
    expect(r.spiT).toBeCloseTo(1, 1);
  });

  it('spiT < 1 quand le rythme réel est en retard sur le plan', () => {
    const projet = projetBase({
      wbs: [{
        id: 't1', parent_id: null, avancement: 20,
        date_debut_prev: '2026-01-01', date_fin_prev: '2026-01-11',
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 2 }],
      }],
    });
    // 5 jours écoulés (AT=5), mais seulement 20% fait (ES ≈ 2 jours de plan) → spiT ≈ 0.4
    const r = calculerEarnedSchedule(projet, new Date('2026-01-06'));
    expect(r.at).toBeCloseTo(5, 0);
    expect(r.es).toBeCloseTo(2, 0);
    expect(r.spiT).toBeCloseTo(0.4, 1);
  });
});

describe('detecterAvancementNonAJour', () => {
  it('retourne [] pour un projet RUN', () => {
    expect(detecterAvancementNonAJour(projetBase({ type: 'RUN' }))).toEqual([]);
  });

  it('signale une tâche dont le % de jours consommés dépasse largement l\'avancement déclaré', () => {
    const projet = projetBase({
      wbs: [{
        id: 't1', nom: 'Tâche A', parent_id: null, avancement: 20,
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 8 }],
      }],
    });
    const alertes = detecterAvancementNonAJour(projet);
    expect(alertes).toHaveLength(1);
    expect(alertes[0].nom).toBe('Tâche A');
    expect(alertes[0].pctJours).toBe(80);
    expect(alertes[0].pctAvancement).toBe(20);
    expect(alertes[0].ecart).toBe(60);
  });

  it('ne signale rien quand avancement et jours consommés sont cohérents', () => {
    const projet = projetBase({
      wbs: [{
        id: 't1', nom: 'Tâche B', parent_id: null, avancement: 50,
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 5 }],
      }],
    });
    expect(detecterAvancementNonAJour(projet)).toEqual([]);
  });

  it('ignore les tâches sans jours réalisés', () => {
    const projet = projetBase({
      wbs: [{
        id: 't1', nom: 'Tâche C', parent_id: null, avancement: 0,
        affectations: [{ collaborateur_id: 'c1', jours_prev: 10, jours_realises: 0 }],
      }],
    });
    expect(detecterAvancementNonAJour(projet)).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { deriverDatesReellesNoeud } from './calculations';

describe('deriverDatesReellesNoeud', () => {
  it("renvoie null si aucune imputation réelle n'existe", () => {
    const node = { affectations: [{ id: 'a1', planning_reel: {}, jours_realises_par_mois: {} }] };
    expect(deriverDatesReellesNoeud(node)).toEqual({ date_debut_reel: null, date_fin_reel: null });
  });

  it('déduit les dates depuis une imputation journalière (planning_reel)', () => {
    const node = { affectations: [{ id: 'a1', planning_reel: { '2026-06-29': 1, '2026-07-02': 0.5, '2026-07-01': 0 } }] };
    expect(deriverDatesReellesNoeud(node)).toEqual({ date_debut_reel: '2026-06-29', date_fin_reel: '2026-07-02' });
  });

  it('déduit les dates depuis une imputation mensuelle (jours_realises_par_mois), bornée au mois', () => {
    const node = { affectations: [{ id: 'a1', jours_realises_par_mois: { '2026-06': 2, '2026-02': 1 } }] };
    expect(deriverDatesReellesNoeud(node)).toEqual({ date_debut_reel: '2026-02-01', date_fin_reel: '2026-06-30' });
  });

  it('combine plusieurs affectations et les deux granularités', () => {
    const node = {
      affectations: [
        { id: 'a1', planning_reel: { '2026-07-15': 1 } },
        { id: 'a2', jours_realises_par_mois: { '2026-05': 3 } },
      ],
    };
    expect(deriverDatesReellesNoeud(node)).toEqual({ date_debut_reel: '2026-05-01', date_fin_reel: '2026-07-15' });
  });
});

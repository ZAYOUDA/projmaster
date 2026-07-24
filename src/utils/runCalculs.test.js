import { describe, it, expect } from 'vitest';
import {
  moisAnnee,
  calculerSuiviLigne,
  calculerSuiviProjetRun,
  calculerBurnRateEtProjection,
  calculerFacturableMois,
} from './runCalculs';

const MOIS_2026 = moisAnnee(2026);

describe('calculerSuiviLigne', () => {
  it('cas nominal : consommé, HT et reste calculés sur plusieurs mois', () => {
    const ligne = { id: 'l1', pu: 650, nbjCommande: 20 };
    const conso = { '2026-01': { l1: 5 }, '2026-02': { l1: 3.5 } };
    const r = calculerSuiviLigne(ligne, conso, MOIS_2026);
    expect(r.consoTotale).toBe(8.5);
    expect(r.htConso).toBe(5525);
    expect(r.reste).toBe(11.5);
  });

  it('ligne sans nbjCommande (consomme sans enveloppe propre) : reste = null', () => {
    const ligne = { id: 'l2', pu: 500, nbjCommande: null };
    const conso = { '2026-01': { l2: 10 } };
    const r = calculerSuiviLigne(ligne, conso, MOIS_2026);
    expect(r.consoTotale).toBe(10);
    expect(r.htConso).toBe(5000);
    expect(r.reste).toBeNull();
  });

  it('mois sans conso : totaux à zéro', () => {
    const ligne = { id: 'l3', pu: 700, nbjCommande: 15 };
    const r = calculerSuiviLigne(ligne, {}, MOIS_2026);
    expect(r.consoTotale).toBe(0);
    expect(r.htConso).toBe(0);
    expect(r.reste).toBe(15);
  });

  it('décimales à 0,25 près', () => {
    const ligne = { id: 'l4', pu: 600, nbjCommande: 10 };
    const conso = { '2026-01': { l4: 1.25 }, '2026-02': { l4: 0.5 } };
    const r = calculerSuiviLigne(ligne, conso, MOIS_2026);
    expect(r.consoTotale).toBe(1.75);
    expect(r.reste).toBe(8.25);
  });
});

describe('calculerSuiviProjetRun', () => {
  // Cas OP MOBILITY : même collaborateur (ZBH) sur deux commandes à PU différents.
  const commandes = [
    { id: 'c1', numero: 'Cmd N06', annee: 2026, lignes: [{ id: 'l1', collabId: 'zbh', pu: 867, nbjCommande: 10 }] },
    { id: 'c2', numero: 'Cmd N07', annee: 2026, lignes: [{ id: 'l2', collabId: 'zbh', pu: 850, nbjCommande: 12 }] },
  ];
  const conso = { '2026-01': { l1: 4, l2: 3 } };

  it('agrège commandé/consommé/reste sur toutes les lignes, PU distincts par ligne', () => {
    const r = calculerSuiviProjetRun(commandes, conso, MOIS_2026);
    expect(r.cmdNbj).toBe(22);
    expect(r.cmdHt).toBe(867 * 10 + 850 * 12);
    expect(r.consoNbj).toBe(7);
    expect(r.consoHt).toBe(867 * 4 + 850 * 3);
    expect(r.reste).toBe(15);
    expect(r.parLigne.l1.reste).toBe(6);
    expect(r.parLigne.l2.reste).toBe(9);
  });
});

describe('calculerBurnRateEtProjection', () => {
  const commandes = [
    { id: 'c1', lignes: [{ id: 'l1', pu: 500, nbjCommande: 20 }] },
  ];

  it('projette un épuisement avant fin d\'année si le rythme est trop élevé', () => {
    const conso = { '2026-01': { l1: 8 }, '2026-02': { l1: 8 } };
    const { burn, projection } = calculerBurnRateEtProjection(commandes, conso, MOIS_2026, 2);
    expect(burn).toBe(8);
    expect(projection.depasseAnnee).toBe(false);
    expect(projection.moisIndex).toBe(1); // février (index 1)
  });

  it('projette au-delà de décembre si le rythme est soutenable', () => {
    const conso = { '2026-01': { l1: 1 }, '2026-02': { l1: 1 } };
    const { projection } = calculerBurnRateEtProjection(commandes, conso, MOIS_2026, 2);
    expect(projection.depasseAnnee).toBe(true);
  });

  it('aucune conso saisie : pas de projection (burn = 0)', () => {
    const { burn, projection } = calculerBurnRateEtProjection(commandes, {}, MOIS_2026, 1);
    expect(burn).toBe(0);
    expect(projection).toBeNull();
  });
});

describe('calculerFacturableMois', () => {
  it('somme le HT du mois toutes commandes/lignes confondues', () => {
    const commandes = [
      { id: 'c1', lignes: [{ id: 'l1', pu: 650, nbjCommande: 10 }] },
      { id: 'c2', lignes: [{ id: 'l2', pu: 500, nbjCommande: 10 }] },
    ];
    const conso = { '2026-03': { l1: 2, l2: 1.5 } };
    expect(calculerFacturableMois(commandes, conso, '2026-03')).toBe(650 * 2 + 500 * 1.5);
    expect(calculerFacturableMois(commandes, conso, '2026-04')).toBe(0);
  });
});

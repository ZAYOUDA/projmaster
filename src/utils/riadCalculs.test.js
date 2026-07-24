import { describe, it, expect } from 'vitest';
import { calculerMatriceRisques, calculerTableauEscalade, calculerSanityCheck } from './riadCalculs';

describe('calculerMatriceRisques', () => {
  it('compte uniquement les risques ouverts, dans la bonne case', () => {
    const risques = [
      { probabilite: 'probable', impact: 'majeur', status: 'ouvert' },
      { probabilite: 'probable', impact: 'majeur', status: 'en_cours' },
      { probabilite: 'probable', impact: 'majeur', status: 'cloture' },
      { probabilite: 'possible', impact: 'mineur', status: 'ouvert' },
    ];
    const grille = calculerMatriceRisques(risques);
    expect(grille.probable.majeur).toBe(2);
    expect(grille.possible.mineur).toBe(1);
    expect(grille.improbable.insignifiant).toBe(0);
  });
});

describe('calculerTableauEscalade', () => {
  const riad = {
    risques: [{ escalade: 'Niveau Projet', status: 'ouvert' }, { escalade: 'Comité 1', status: 'cloture' }],
    issues: [{ escalade: 'Niveau Projet', status: 'ouvert' }],
    actions: [],
    decisions: [{ escalade: 'Comité 1', status: 'cloture' }],
  };
  const niveaux = ['Niveau Projet', 'Comité 1'];

  it('sépare correctement ouvert vs clos par niveau', () => {
    const ouvert = calculerTableauEscalade(riad, niveaux, false);
    expect(ouvert.rows[0]).toMatchObject({ niveau: 'Niveau Projet', risques: 1, issues: 1, actions: 0, decisions: 0 });
    expect(ouvert.total).toMatchObject({ risques: 1, issues: 1, actions: 0, decisions: 0 });

    const clos = calculerTableauEscalade(riad, niveaux, true);
    expect(clos.rows[1]).toMatchObject({ niveau: 'Comité 1', risques: 1, decisions: 1 });
    expect(clos.total).toMatchObject({ risques: 1, decisions: 1 });
  });
});

describe('calculerSanityCheck', () => {
  it('totalise tous statuts confondus par module', () => {
    const riad = { risques: [{}, {}], issues: [{}], actions: [], decisions: [{}, {}, {}] };
    expect(calculerSanityCheck(riad)).toEqual({ niveau: 'Total', risques: 2, issues: 1, actions: 0, decisions: 3 });
  });
});

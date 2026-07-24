import { describe, it, expect } from 'vitest';
import { parseFrNumber, parseCraExport, autoMatchConsultants, autoMatchMissions } from './craParser';

const SAMPLE = [
  'CUBE;Datatilt - Planning Equipe',
  'Scenario;Actual',
  'Indicateur;Jours',
  'Jour;Mission;Zied BEN HMIDA;Marie DUPONT;Total Consultant',
  '2026;BM - Ark_us_dev;10;6,5;16,5',
  '2026 - janvier;BM - Ark_us_dev;4;2;6',
  '2026 - fevrier;BM - Ark_us_dev;5;3;8',
  '2026 - mars;BM - Ark_us_dev;-;1,5;1,5',
].join('\n');

describe('parseFrNumber', () => {
  it('parse les décimales à virgule et les espaces insécables', () => {
    expect(parseFrNumber('1,5')).toBe(1.5);
    expect(parseFrNumber('1 234,56')).toBe(1234.56);
  });
  it('traite "-" et vide comme zéro', () => {
    expect(parseFrNumber('-')).toBe(0);
    expect(parseFrNumber('')).toBe(0);
    expect(parseFrNumber(null)).toBe(0);
  });
});

describe('parseCraExport', () => {
  const data = parseCraExport(SAMPLE);

  it('cas nominal : extrait les entrées mensuelles et les métadonnées cube', () => {
    expect(data.meta.cube).toBe('Datatilt - Planning Equipe');
    expect(data.consultants).toEqual(['Zied BEN HMIDA', 'Marie DUPONT']);
    expect(data.missions).toEqual(['BM - Ark_us_dev']);
    expect(data.months).toEqual(['2026-01', '2026-02', '2026-03']);
  });

  it('mois sans conso : les valeurs "-" ne produisent pas d\'entrée', () => {
    const marsZied = data.entries.find((e) => e.month === '2026-03' && e.consultant === 'Zied BEN HMIDA');
    expect(marsZied).toBeUndefined();
  });

  it('décimales à virgule correctement converties', () => {
    const marsMarie = data.entries.find((e) => e.month === '2026-03' && e.consultant === 'Marie DUPONT');
    expect(marsMarie.jours).toBe(1.5);
  });

  it('signale un écart entre le total annuel et la somme mensuelle', () => {
    expect(data.warnings.some((w) => w.includes('Zied BEN HMIDA'))).toBe(true);
    expect(data.warnings.some((w) => w.includes('Marie DUPONT'))).toBe(false);
  });

  it('lève une erreur si la ligne d\'en-têtes est introuvable', () => {
    expect(() => parseCraExport('rien à voir ici')).toThrow(/Format non reconnu/);
  });
});

describe('autoMatchConsultants', () => {
  const collaborateurs = [
    { id: 'c1', prenom: 'Zied', nom: 'Ben Hmida' },
    { id: 'c2', prenom: 'Marie', nom: 'Dupont' },
  ];

  it('rapproche par inclusion de tokens malgré la casse/accents', () => {
    const result = autoMatchConsultants(['Zied BEN HMIDA', 'Marie DUPONT'], collaborateurs);
    expect(result['Zied BEN HMIDA']).toBe('c1');
    expect(result['Marie DUPONT']).toBe('c2');
  });

  it('renvoie null si aucun rapprochement suffisant', () => {
    const result = autoMatchConsultants(['Inconnu Personne'], collaborateurs);
    expect(result['Inconnu Personne']).toBeNull();
  });
});

describe('autoMatchMissions', () => {
  it('rapproche une mission à un projet par tokens communs', () => {
    const projets = [{ id: 'p1', nom: 'ARK US' }, { id: 'p2', nom: 'OP MOBILITY' }];
    const result = autoMatchMissions(['BM - Ark_us_dev'], projets);
    expect(result['BM - Ark_us_dev']).toBe('p1');
  });
});

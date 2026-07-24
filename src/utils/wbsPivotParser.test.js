import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as XLSX from 'xlsx';
import { parseWbsPivot } from './wbsPivotParser';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readFixtureArrayBuffer(name) {
  const buf = readFileSync(join(__dirname, '__fixtures__', name));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

describe('parseWbsPivot — fichier de recette ARK-US', () => {
  const data = parseWbsPivot(readFixtureArrayBuffer('ARK-US_ProjMaster-Import.xlsx'));

  it('ne remonte aucune erreur bloquante', () => {
    expect(data.errors).toEqual([]);
  });

  it('lit les métadonnées PROJET', () => {
    expect(data.projet).toMatchObject({
      nom: 'ARK US — IBM Planning Analytics',
      type: 'BUILD',
      devise: 'EUR',
      date_debut: '2026-03-30',
      statut_projet: 'en_cours',
      format_version: '1.0',
    });
  });

  it('lit les 4 ressources', () => {
    expect(data.ressources).toHaveLength(4);
    expect(data.ressources.find((r) => r.code === 'DTc')).toMatchObject({ tjm: 900, facturable: true });
    expect(data.ressources.find((r) => r.code === 'ARK')).toMatchObject({ tjm: 0, facturable: false });
  });

  it('lit 38 tâches réparties sur 7 nœuds L1', () => {
    expect(data.wbs).toHaveLength(38);
    const l1s = new Set(data.wbs.map((t) => t.wbsL1));
    expect(l1s.size).toBe(7);
  });

  it('respecte les totaux de recette (§3.1)', () => {
    const totalPrevue = data.wbs.reduce((s, t) => s + (t.chargePrevue || 0), 0);
    const totalReelle = data.wbs.reduce((s, t) => s + (t.chargeReelle || 0), 0);
    expect(totalPrevue).toBeCloseTo(48.6812, 4);
    expect(totalReelle).toBeCloseTo(38.0, 4);
  });

  it('recalcule le coût prévu manquant via TJM ressource et retombe sur 40 713,12 €', () => {
    const tjmByCode = Object.fromEntries(data.ressources.map((r) => [r.code, r.tjm]));
    const total = data.wbs.reduce((s, t) => {
      if (t.coutPrevu != null) return s + t.coutPrevu;
      if (t.chargePrevue != null) return s + t.chargePrevue * (tjmByCode[t.ressource] || 0);
      return s;
    }, 0);
    expect(total).toBeCloseTo(40713.12, 2);
  });

  it('T038 a des dates réelles mais aucune date prévisionnelle (réalisé sans prévisionnel)', () => {
    const t038 = data.wbs.find((t) => t.id === 'T038');
    expect(t038.debutPrev).toBeNull();
    expect(t038.finPrev).toBeNull();
    expect(t038.debutReel).toBe('2026-04-24');
    expect(t038.finReel).toBe('2026-05-18');
    expect(t038.chargePrevue).toBe(2); // a bien un prévisionnel en charge/coût, juste pas de dates
  });

  it("ne déclenche aucun avertissement sur ce fichier propre (Σ réalisé mensuel = Charge_Reelle_j)", () => {
    expect(data.warnings).toEqual([]);
  });
});

describe('parseWbsPivot — validations bloquantes', () => {
  it('rejette un fichier sans feuille requise', () => {
    // Un classeur minimal ne contenant qu'une feuille non pertinente
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['a']]), 'AUTRE');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const data = parseWbsPivot(buf);
    expect(data.errors.some((e) => e.includes('PROJET'))).toBe(true);
  });

  it('rejette un format_version non supporté', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Cle', 'Valeur'], ['nom', 'Test'], ['type', 'BUILD'], ['format_version', '2.0'],
    ]), 'PROJET');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Code', 'Libelle', 'Profil', 'TJM_EUR', 'Facturable']]), 'RESSOURCES');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID', 'WBS_L1', 'Tache', 'Statut']]), 'WBS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID_Tache', 'Mois', 'Jours']]), 'REALISE_MENSUEL');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const data = parseWbsPivot(buf);
    expect(data.errors.some((e) => e.includes('format_version'))).toBe(true);
  });

  it('rejette un ID de tâche dupliqué', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['Cle', 'Valeur'], ['nom', 'Test'], ['type', 'BUILD'], ['format_version', '1.0'],
    ]), 'PROJET');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Code', 'Libelle', 'Profil', 'TJM_EUR', 'Facturable']]), 'RESSOURCES');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['ID', 'WBS_L1', 'Tache', 'Statut'], ['T001', 'Module', 'Tache A', 'a_faire'], ['T001', 'Module', 'Tache B', 'a_faire'],
    ]), 'WBS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['ID_Tache', 'Mois', 'Jours']]), 'REALISE_MENSUEL');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const data = parseWbsPivot(buf);
    expect(data.errors.some((e) => e.includes('doublon'))).toBe(true);
  });
});

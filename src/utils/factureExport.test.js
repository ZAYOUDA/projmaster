import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { genererClasseurFacture } from './factureExport';

describe('genererClasseurFacture', () => {
  const projet = { nom: 'LVMH Beauty Tech' };
  const facture = {
    numero: 'FAC-2026-001',
    mois: '2026-06',
    reference_client: '4505796020',
    date_emission: '2026-06-30',
    date_echeance: '2026-07-30',
    tva: 20,
    lignes: [
      { description: 'Délégation de consultant IBM Planning Analytics', jours: 5, tjm: 1000, montant: 5000 },
    ],
  };

  const wb = genererClasseurFacture(projet, facture);
  const sheet = wb.Sheets['Facture'];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const flat = rows.flat().join(' | ');

  it('inclut les informations de la facture et du client', () => {
    expect(flat).toContain('FAC-2026-001');
    expect(flat).toContain('LVMH Beauty Tech');
    expect(flat).toContain('4505796020');
  });

  it('inclut les coordonnées Datatilt et le RIB', () => {
    expect(flat).toContain('Datatilt');
    expect(flat).toContain('822 102 505 00028');
    expect(flat).toContain('BNPAFRPPXXX');
    expect(flat).toContain('FR76 3000 4003 4500 0101 9740 747');
  });

  it('calcule correctement HT / TVA / TTC', () => {
    const row = rows.find((r) => r[2] === 'Total HT');
    expect(row[3]).toBe(5000);
    const tvaRow = rows.find((r) => String(r[2]).startsWith('TVA'));
    expect(tvaRow[3]).toBe(1000);
    const ttcRow = rows.find((r) => r[2] === 'Total TTC');
    expect(ttcRow[3]).toBe(6000);
  });
});

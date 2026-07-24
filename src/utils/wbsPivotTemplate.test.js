import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { genererClasseurModeleWbsPivot } from './wbsPivotTemplate';
import { parseWbsPivot } from './wbsPivotParser';

describe('genererClasseurModeleWbsPivot', () => {
  it('produit un classeur que le parseur accepte sans erreur', () => {
    const wb = genererClasseurModeleWbsPivot();
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    const data = parseWbsPivot(buf);
    expect(data.errors).toEqual([]);
    expect(data.projet).toMatchObject({ type: 'BUILD', format_version: '1.0' });
    expect(data.wbs).toHaveLength(1);
    expect(data.ressources).toHaveLength(1);
    expect(data.realiseMensuel).toHaveLength(1);
  });
});

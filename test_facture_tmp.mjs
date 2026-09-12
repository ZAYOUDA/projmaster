import XLSX from 'xlsx';
const mod = await import('./src/utils/factureExport.js');

const projet = { nom: 'RATP' };
const facture = {
  numero: 'FAC-TEST-001',
  reference_client: 'BC-123',
  date_emission: '2026-07-30',
  mois: '2026-06',
  tva: 20,
  lignes: [
    { description: 'Delegation consultant', collaborateur_id: 'c1', jours: 5, tjm: 1000, montant: 5000 },
  ],
};
const collaborateurs = [{ id: 'c1', prenom: 'Jean', nom: 'Dupont', profil: 'Confirmé' }];

const wb = mod.genererClasseurFacture(projet, facture, collaborateurs);
XLSX.writeFile(wb, '/tmp/test_out.xlsx');
console.log('OK, written');

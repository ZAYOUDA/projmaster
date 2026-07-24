import * as XLSX from 'xlsx';

/**
 * factureExport.js — Export d'une facture au format Excel (données propres, sans mise
 * en forme avancée : xlsx/SheetJS gère mal les styles riches — logo, couleurs, encadrés).
 */

// Coordonnées fixes de l'émetteur (Datatilt) — identiques sur toutes les factures.
const DATATILT = {
  nom: 'Datatilt',
  adresse: '16 rue Louis Rouquier',
  codePostalVille: '92300 Levallois-Perret',
  email: 'bruno.taboument@datatilt.fr',
  telephone: '06 24 22 30 53',
  siret: '822 102 505 00028',
  codeApe: '6202A',
  regimeTva: 'Encaissements',
  conditionPaiement: '30 jours fin de mois',
  modeReglement: 'par virement bancaire au compte indiqué ci-dessous',
  banque: {
    nomCompte: 'Datatilt',
    banque: 'BNP Paribas Asnières sur Seine',
    codeBanque: '30004',
    codeAgence: '00345',
    numeroCompte: '00010197407',
    cleRib: '47',
    bic: 'BNPAFRPPXXX',
    iban: 'FR76 3000 4003 4500 0101 9740 747',
  },
};

function formatMoisLabel(mois) {
  if (!mois) return '';
  const [year, month] = mois.split('-');
  return new Date(+year, +month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function montantFacture(f) {
  return (f.lignes || []).reduce((s, l) => s + l.montant, 0);
}

export function genererClasseurFacture(projet, facture) {
  const ht = montantFacture(facture);
  const tva = ht * (facture.tva || 0) / 100;
  const ttc = ht + tva;

  const rows = [
    ['FACTURE'],
    ['Numéro', facture.numero],
    ['Référence client / bon de commande', facture.reference_client || ''],
    ['Période', formatMoisLabel(facture.mois)],
    ['Date de facture', facture.date_emission || ''],
    ['Échéance', facture.date_echeance || ''],
    [],
    ['Fournisseur', '', 'Client'],
    [DATATILT.nom, '', projet.nom || ''],
    [DATATILT.adresse, '', ''],
    [DATATILT.codePostalVille, '', ''],
    [`Email : ${DATATILT.email}`, '', ''],
    [`Téléphone : ${DATATILT.telephone}`, '', ''],
    [`SIRET : ${DATATILT.siret}`, '', ''],
    [`Code APE : ${DATATILT.codeApe}`, '', ''],
    [],
    ['Désignation', 'Jours', 'PU HT (€)', 'Total HT (€)'],
    ...(facture.lignes || []).map((l) => [l.description, l.jours, l.tjm, l.montant]),
    [],
    ['', '', 'Total HT', ht],
    ['', '', `TVA (${facture.tva || 0}%)`, tva],
    ['', '', 'Total TTC', ttc],
    [],
    [`Régime de TVA : ${DATATILT.regimeTva}`],
    [`Condition de paiement : ${DATATILT.conditionPaiement}`],
    [`Mode de règlement : ${DATATILT.modeReglement}`],
    [],
    ['Nom du compte', 'Banque', 'Code banque', 'Code agence', 'N° compte', 'Clé RIB'],
    [DATATILT.banque.nomCompte, DATATILT.banque.banque, DATATILT.banque.codeBanque, DATATILT.banque.codeAgence, DATATILT.banque.numeroCompte, DATATILT.banque.cleRib],
    [],
    ['BIC', DATATILT.banque.bic],
    ['IBAN', DATATILT.banque.iban],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Facture');
  return wb;
}

export function exporterFactureExcel(projet, facture) {
  const wb = genererClasseurFacture(projet, facture);
  XLSX.writeFile(wb, `${facture.numero}.xlsx`);
}

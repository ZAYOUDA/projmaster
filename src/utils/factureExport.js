import * as XLSX from 'xlsx';

/**
 * factureExport.js — Export d'une facture au format Excel, calqué sur le modèle client fourni
 * (cf. facture LVMH de référence) : bloc Fournisseur/Client, tableau de lignes avec Profil
 * Consultant/Dates/Qté/PU/Total, totaux en formules Excel (pas des valeurs figées), RIB, footer
 * légal. Reste volontairement sans mise en forme riche (pas de couleurs/bordures) — xlsx/SheetJS
 * gère mal les styles avancés — mais le classeur est 100% éditable à la main une fois ouvert :
 * les formules recalculent si on modifie une quantité ou un PU.
 */

// Coordonnées fixes de l'émetteur (Datatilt) — identiques sur toutes les factures.
const DATATILT = {
  nom: 'Datatilt',
  adresse: '16 rue Louis Rouquier',
  codePostalVille: '92300 Levallois-Perret',
  email: 'bruno.taboument@datatilt.fr',
  telephone: '06 24 22 30 53',
  siret: '822 102 505 00028',
  tva: 'FR77822102505',
  codeApe: '6202A',
  regimeTva: 'Encaissements',
  conditionPaiement: '30 jours fin de mois',
  modeReglement: 'par virement bancaire au compte indiqué ci-dessous',
  capitalSocial: '1 003 euros',
  rcs: 'Nanterre',
  banque: {
    nomCompte: 'Datatilt',
    banque: 'BNP Paribas Asnières sur Seine',
    codeBanque: '30004',
    codeAgence: '00345',
    numeroCompte: '00010197407',
    cleRib: '47',
    bic: 'BNPAFRPPXXX',
    iban: 'FR7630004003450001019740747',
  },
};

function formatMoisLabel(mois) {
  if (!mois) return '';
  const [year, month] = mois.split('-');
  return new Date(+year, +month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function formatDateFr(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR');
}

export function genererClasseurFacture(projet, facture, collaborateurs = []) {
  const lignes = facture.lignes || [];
  const tvaPct = facture.tva || 0;

  // Le modèle client réserve toujours au moins 3 lignes dans le tableau (même avec 1 seule
  // remplie) — les lignes vides restent éditables à la main et sont déjà couvertes par la
  // formule de somme, donc pas besoin de retoucher la formule pour ajouter une ligne à la main.
  const nbLignesReservees = Math.max(lignes.length, 1) + 2;
  const firstLigneRow = 17; // même position que le modèle
  const lastLigneRow = firstLigneRow + nbLignesReservees - 1;
  const totalHtRow = lastLigneRow + 1;
  const tvaRow = totalHtRow + 1;
  const ttcRow = tvaRow + 1;

  const rows = [
    ['datatilt', '', '', '', 'Facture:', facture.numero],
    ['', '', '', '', 'Bon de commande:', facture.reference_client || ''],
    ['', '', '', '', '', 'Facture adressée en 1 exemplaire'],
    ['', '', '', '', 'Date de la facture:', formatDateFr(facture.date_emission)],
    [],
    ['Fournisseur', '', '', 'Client'],
    ['', DATATILT.nom, '', '', projet.nom || ''],
    ['', DATATILT.adresse],
    ['', DATATILT.codePostalVille],
    // Bloc contact client (nom/poste/email/téléphone) : pas encore de fiche client dans
    // ProjMaster (seul projet.nom existe) — cellules laissées vides mais avec les bons libellés,
    // à compléter à la main dans Excel.
    ['Email:', DATATILT.email, '', 'Contact principal:', ''],
    ['Téléphone:', DATATILT.telephone, '', 'Poste:', ''],
    ['Siret:', DATATILT.siret, '', 'Email:', ''],
    ['TVA:', DATATILT.tva, '', 'Téléphone:', ''],
    ['Code APE:', DATATILT.codeApe, '', 'Bon de commande:', facture.reference_client || ''],
    [],
    ['Désignation', 'Profil Consultant', 'Dates', 'Qté (jrs)', 'Px Unit HT', 'TOTAL HT'],
  ];

  for (let i = 0; i < nbLignesReservees; i++) {
    const l = lignes[i];
    if (!l) { rows.push([]); continue; }
    const collab = collaborateurs.find((c) => c.id === l.collaborateur_id);
    rows.push([l.description || '', collab?.profil || '', formatMoisLabel(facture.mois), l.jours, l.tjm, null]);
  }

  rows.push(['', '', '', '', 'TOTAL HT', null]);
  rows.push(['', '', '', '', `TVA à ${tvaPct}%`, null]);
  rows.push(['', '', '', '', 'TOTAL TTC', null]);
  rows.push([]);
  rows.push(['Régime de TVA :', DATATILT.regimeTva]);
  rows.push(['Condition de paiement :', DATATILT.conditionPaiement]);
  rows.push(['Mode de règlement :', DATATILT.modeReglement]);
  rows.push([]);
  rows.push(['Nom du compte', 'Banque', 'Code Banque', 'Code Agence', 'N° Compte', 'Clé RIB']);
  rows.push([DATATILT.banque.nomCompte, DATATILT.banque.banque, DATATILT.banque.codeBanque, DATATILT.banque.codeAgence, DATATILT.banque.numeroCompte, DATATILT.banque.cleRib]);
  rows.push([]);
  rows.push(['BIC']);
  rows.push([DATATILT.banque.bic]);
  rows.push(['IBAN (International)']);
  rows.push([DATATILT.banque.iban]);
  rows.push([]);
  rows.push([`${DATATILT.nom} - ${DATATILT.adresse} ${DATATILT.codePostalVille}`]);
  rows.push([`SAS au capital de ${DATATILT.capitalSocial}`]);
  rows.push([`SIREN : ${DATATILT.siret.split(' ').slice(0, 3).join(' ')} R.C.S de ${DATATILT.rcs} - Code APE : ${DATATILT.codeApe} - N° TVA Intracommunautaire : ${DATATILT.tva}`]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Formules — recalculent dans Excel si la personne modifie une quantité ou un PU à la main.
  lignes.forEach((l, i) => {
    const r = firstLigneRow + i;
    ws[`F${r}`] = { t: 'n', f: `D${r}*E${r}` };
  });
  ws[`F${totalHtRow}`] = { t: 'n', f: `SUM(F${firstLigneRow}:F${lastLigneRow})` };
  ws[`F${tvaRow}`] = { t: 'n', f: `F${totalHtRow}*${tvaPct / 100}` };
  ws[`F${ttcRow}`] = { t: 'n', f: `F${totalHtRow}+F${tvaRow}` };

  ws['!cols'] = [{ wch: 45 }, { wch: 20 }, { wch: 14 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Facture');
  return wb;
}

export function exporterFactureExcel(projet, facture, collaborateurs = []) {
  const wb = genererClasseurFacture(projet, facture, collaborateurs);
  XLSX.writeFile(wb, `${facture.numero}.xlsx`);
}

import * as XLSX from 'xlsx';

/**
 * wbsPivotTemplate.js — Génère le classeur modèle vide « ProjMaster WBS Import v1.0 »
 * (mêmes 5 feuilles que celles attendues par wbsPivotParser.js), avec une ligne d'exemple
 * par feuille de données pour clarifier le format attendu.
 */

const LISEZMOI = [
  ["ProjMaster — Modèle d'import de planning (format pivot v1.0)"],
  [''],
  ['Ce classeur contient 5 feuilles. Ne renommez pas les feuilles ni les en-têtes de colonnes.'],
  [''],
  ['1. PROJET — informations générales du projet (une ligne = une clé/valeur).'],
  ['2. RESSOURCES — les intervenants du planning et leur TJM.'],
  ['3. WBS — une ligne par tâche. WBS_L1 = module (obligatoire), WBS_L2 = sous-catégorie (optionnel).'],
  ['4. REALISE_MENSUEL — détail du réalisé par tâche et par mois (AAAA-MM).'],
  [''],
  ['Remplacez les lignes d\'exemple par vos données (supprimez-les si besoin), puis importez'],
  ['ce fichier depuis Projet → onglet WBS → « Importer un planning ».'],
  [''],
  ['Rappels de format :'],
  ['- PROJET.type : BUILD ou RUN (WBS ne concerne que les projets BUILD).'],
  ['- PROJET.format_version : doit rester "1.0".'],
  ['- WBS.Statut : a_faire, en_cours, termine ou bloque.'],
  ['- WBS.ID : identifiant unique dans le fichier (ex. T001, T002…).'],
  ['- Les dates sont au format AAAA-MM-JJ, les mois au format AAAA-MM.'],
  ['- Une cellule vide = non renseigné (ne jamais mettre 0 à la place d\'une case vide).'],
];

const PROJET = [
  ['Cle', 'Valeur'],
  ['nom', 'Mon Projet'],
  ['client', ''],
  ['type', 'BUILD'],
  ['devise', 'EUR'],
  ['date_debut', '2026-01-01'],
  ['statut_projet', 'en_cours'],
  ['source', ''],
  ['format_version', '1.0'],
];

const RESSOURCES = [
  ['Code', 'Libelle', 'Profil', 'TJM_EUR', 'Facturable'],
  ['EX1', 'Prénom Nom', 'Consultant', 900, 'OUI'],
];

const WBS = [
  ['ID', 'WBS_L1', 'WBS_L2', 'Tache', 'Commentaire', 'Ressource', 'Statut', 'Charge_Prevue_j', 'Charge_Planifiee_j', 'Charge_Reelle_j', 'Cout_Prevu_EUR', 'Debut_Prev', 'Fin_Prev', 'Debut_Reel', 'Fin_Reel', 'Prerequis'],
  ['T001', 'Module 1', '', 'Tâche exemple', '', 'EX1', 'a_faire', 1, 1, '', '', '2026-01-01', '2026-01-02', '', '', ''],
];

const REALISE_MENSUEL = [
  ['ID_Tache', 'Tache', 'Mois', 'Jours'],
  ['T001', 'Tâche exemple', '2026-01', 0.5],
];

export function genererClasseurModeleWbsPivot() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(LISEZMOI), 'LISEZMOI');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(PROJET), 'PROJET');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(RESSOURCES), 'RESSOURCES');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(WBS), 'WBS');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(REALISE_MENSUEL), 'REALISE_MENSUEL');
  return wb;
}

export function telechargerModeleWbsPivot(nomFichier = 'ProjMaster-WBS-Import-Modele.xlsx') {
  const wb = genererClasseurModeleWbsPivot();
  XLSX.writeFile(wb, nomFichier);
}

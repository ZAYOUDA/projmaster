import * as XLSX from 'xlsx';
import { calculerNumeroWBS, flattenWBS, getLeaves } from '../data/calculations';

/**
 * resumeExport.js — Export "Résumé" au format Excel (données propres, sans mise en forme
 * avancée, cf. factureExport.js) : planning tâches/sous-tâches indenté par tabulations, charge
 * réelle uniquement (pas de prévisionnel), colonne collaborateur — pensé pour être partagé
 * tel quel avec un client.
 */

// Charge réelle (jours réalisés) d'un nœud : direct pour une feuille, somme des feuilles
// descendantes pour un livrable/parent (même logique que Planning/Budget).
function chargeReelleNoeud(node, allNodes) {
  return getLeaves(node, allNodes)
    .flatMap((l) => l.affectations || [])
    .reduce((s, a) => s + (a.jours_realises || 0), 0);
}

// Noms des collaborateurs affectés à une feuille (vide pour les nœuds parents — la charge y
// est un total, pas rattachée à une personne en particulier).
function collaborateursNoeud(node, allNodes, collaborateurs) {
  if (allNodes.some((n) => n.parent_id === node.id)) return '';
  return (node.affectations || [])
    .map((a) => collaborateurs.find((c) => c.id === a.collaborateur_id))
    .filter(Boolean)
    .map((c) => `${c.prenom} ${c.nom}`)
    .join(', ');
}

export function construireLignesResume(projet, collaborateurs) {
  const numeros = calculerNumeroWBS(projet.wbs);
  return flattenWBS(projet.wbs).map(({ node, depth }) => ({
    numero: numeros[node.id] || '',
    nom: '\t'.repeat(depth) + node.nom,
    collaborateur: collaborateursNoeud(node, projet.wbs, collaborateurs),
    chargeReelle: chargeReelleNoeud(node, projet.wbs),
    statut: node.statut,
  }));
}

const STATUT_LABELS = { non_demarre: 'Non démarré', en_cours: 'En cours', termine: 'Terminé', bloque: 'Bloqué' };

export function genererClasseurResume(projet, collaborateurs) {
  const lignes = construireLignesResume(projet, collaborateurs);
  const rows = [
    [projet.nom],
    [`Résumé planning — export du ${new Date().toLocaleDateString('fr-FR')}`],
    [],
    ['#', 'Tâche', 'Collaborateur', 'Charge réelle (j)', 'Statut'],
    ...lignes.map((l) => [
      l.numero, l.nom, l.collaborateur,
      l.chargeReelle > 0 ? Math.round(l.chargeReelle * 100) / 100 : '',
      STATUT_LABELS[l.statut] || l.statut,
    ]),
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 8 }, { wch: 55 }, { wch: 24 }, { wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Résumé');
  return wb;
}

export function exporterResumeExcel(projet, collaborateurs) {
  const wb = genererClasseurResume(projet, collaborateurs);
  XLSX.writeFile(wb, `${projet.nom} - Résumé.xlsx`);
}

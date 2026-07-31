import ExcelJS from 'exceljs';
import { calculerNumeroWBS, flattenWBS, getLeaves } from '../data/calculations';

/**
 * resumeExport.js — Données + export Excel de l'onglet "Résumé" : planning tâches/sous-tâches
 * indenté par niveau, imputations réelles jour par jour + total, colonne collaborateur — pensé
 * pour être partagé tel quel avec un client.
 *
 * Utilise exceljs (pas xlsx/SheetJS comme factureExport.js) car SheetJS Community Edition
 * n'écrit pas les styles (couleurs, remplissages) dans le .xlsx — voir le commentaire en tête de
 * factureExport.js. exceljs supporte les couleurs et l'indentation native des cellules.
 */

const STATUT_LABELS = { non_demarre: 'Non démarré', en_cours: 'En cours', termine: 'Terminé', bloque: 'Bloqué' };
const STATUT_COLORS = { non_demarre: 'FF888780', en_cours: 'FF378ADD', termine: 'FF1D9E75', bloque: 'FFD85A30' };

// toISOString() convertit en UTC : pour un Date construit à minuit local (fuseau UTC+, ex.
// France), ça retombe sur la veille. On formate donc à partir des composants locaux du Date.
function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function addDays(iso, n) { const d = new Date(iso); d.setDate(d.getDate() + n); return toISO(d); }
function isWeekendIso(iso) { const day = new Date(iso).getDay(); return day === 0 || day === 6; }

// Charge réelle (jours réalisés) d'un nœud, tous jours confondus : direct pour une feuille,
// somme des feuilles descendantes pour un livrable/parent (même logique que Planning/Budget).
function chargeReelleNoeud(node, allNodes) {
  return getLeaves(node, allNodes)
    .flatMap((l) => l.affectations || [])
    .reduce((s, a) => s + (a.jours_realises || 0), 0);
}

// Charge réelle d'un nœud pour un jour ISO précis (même logique de rollup, au jour le jour).
function chargeReelleNoeudJour(node, allNodes, iso) {
  return getLeaves(node, allNodes)
    .flatMap((l) => l.affectations || [])
    .reduce((s, a) => s + ((a.planning_reel || {})[iso] || 0), 0);
}

function collaborateursNoeud(node, allNodes, collaborateurs) {
  if (allNodes.some((n) => n.parent_id === node.id)) return [];
  return (node.affectations || [])
    .map((a) => collaborateurs.find((c) => c.id === a.collaborateur_id))
    .filter(Boolean);
}

// Plage de jours (bornes incluses) couvrant toutes les imputations réelles saisies sur le
// projet, tous nœuds confondus — vide si rien n'a encore été imputé.
export function calculerPlageJoursReels(projet) {
  const isos = projet.wbs
    .flatMap((n) => n.affectations || [])
    .flatMap((a) => Object.keys(a.planning_reel || {}))
    .filter(Boolean)
    .sort();
  if (isos.length === 0) return [];
  const days = [];
  let cur = isos[0];
  const fin = isos[isos.length - 1];
  while (cur <= fin) { days.push(cur); cur = addDays(cur, 1); }
  return days;
}

// Construit les lignes du résumé (une par nœud WBS, dans l'ordre d'affichage) avec, pour
// chacune : numéro, nom, profondeur (indentation), collaborateurs, charge réelle totale, statut,
// et le détail jour par jour sur `jours` (map iso -> valeur, 0 si rien ce jour-là).
export function construireLignesResume(projet, collaborateurs, jours) {
  const numeros = calculerNumeroWBS(projet.wbs);
  return flattenWBS(projet.wbs).map(({ node, depth }) => ({
    id: node.id,
    numero: numeros[node.id] || '',
    nom: node.nom,
    depth,
    isLeaf: !projet.wbs.some((n) => n.parent_id === node.id),
    collaborateurs: collaborateursNoeud(node, projet.wbs, collaborateurs),
    chargeReelle: chargeReelleNoeud(node, projet.wbs),
    statut: node.statut,
    parJour: Object.fromEntries(jours.map((iso) => [iso, chargeReelleNoeudJour(node, projet.wbs, iso)])),
  }));
}

export async function genererClasseurResume(projet, collaborateurs) {
  const jours = calculerPlageJoursReels(projet);
  const lignes = construireLignesResume(projet, collaborateurs, jours);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Résumé');

  const colsFixes = [
    { header: '#', key: 'numero', width: 8 },
    { header: 'Tâche', key: 'nom', width: 50 },
    { header: 'Collaborateur', key: 'collaborateur', width: 26 },
    { header: 'Charge réelle (j)', key: 'charge', width: 16 },
    { header: 'Statut', key: 'statut', width: 14 },
  ];
  ws.columns = [
    ...colsFixes,
    ...jours.map((iso) => ({ header: new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }), key: iso, width: 6 })),
  ];

  // Titre + sous-titre au-dessus du tableau
  ws.insertRow(1, [projet.nom]);
  ws.insertRow(2, [`Résumé planning — export du ${new Date().toLocaleDateString('fr-FR')}`]);
  ws.insertRow(3, []);
  ws.mergeCells(1, 1, 1, colsFixes.length + jours.length);
  ws.mergeCells(2, 1, 2, colsFixes.length + jours.length);
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FF1A1A18' } };
  ws.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF888780' } };

  // En-têtes de colonnes (ligne 4, puisque 3 lignes de titre insérées avant)
  const headerRow = ws.getRow(4);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A18' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.height = 22;

  lignes.forEach((l) => {
    const row = ws.addRow({
      numero: l.numero,
      nom: l.nom,
      collaborateur: l.collaborateurs.map((c) => `${c.prenom} ${c.nom}`).join(', '),
      charge: l.chargeReelle > 0 ? Math.round(l.chargeReelle * 100) / 100 : null,
      statut: STATUT_LABELS[l.statut] || l.statut,
      ...Object.fromEntries(jours.map((iso) => [iso, l.parJour[iso] > 0 ? Math.round(l.parJour[iso] * 100) / 100 : null])),
    });

    // Indentation native Excel (pas de tabulations dans le texte — plus fiable à l'ouverture)
    row.getCell('nom').alignment = { indent: l.depth * 2 };
    row.getCell('nom').font = { bold: !l.isLeaf };
    // Les livrables/modules (profondeur 0) ressortent avec un fond légèrement teinté, comme
    // dans le WBS de l'appli — les sous-tâches restent sur fond blanc.
    if (l.depth === 0) {
      ['numero', 'nom', 'collaborateur', 'charge', 'statut'].forEach((k) => {
        row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EFF9' } };
      });
    }
    row.getCell('statut').font = { color: { argb: STATUT_COLORS[l.statut] || 'FF5F5E5A' }, bold: true };
    row.getCell('charge').alignment = { horizontal: 'right' };
    row.getCell('charge').font = { ...(row.getCell('charge').font || {}), bold: l.chargeReelle > 0 };

    jours.forEach((iso) => {
      const cell = row.getCell(iso);
      cell.alignment = { horizontal: 'center' };
      cell.font = { size: 9 };
      if (isWeekendIso(iso)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEECE6' } };
      } else if (l.parJour[iso] > 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAEEF8' } };
      }
    });
  });

  ws.views = [{ state: 'frozen', xSplit: colsFixes.length, ySplit: 4 }];
  return wb;
}

export async function exporterResumeExcel(projet, collaborateurs) {
  const wb = await genererClasseurResume(projet, collaborateurs);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projet.nom} - Résumé.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

import ExcelJS from 'exceljs';
import { calculerNumeroWBS, flattenWBS, getLeaves } from '../data/calculations';

/**
 * resumeExport.js — Données + export Excel de l'onglet "Résumé" : planning tâches/sous-tâches
 * indenté par niveau, imputations jour par jour + total, colonne collaborateur — pensé pour être
 * partagé tel quel avec un client. Supporte 3 vues (`vue`: 'reel' | 'prev' | 'les_deux') pour
 * choisir entre charge réalisée, charge planifiée, ou les deux — même principe que le picklist
 * Prév./Réel/Les deux de Planning (src/pages/ProjetPlanning.jsx).
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
function arrondi(n) { return Math.round((n || 0) * 100) / 100; }

// Charge (jours) d'un nœud, tous jours confondus : direct pour une feuille, somme des feuilles
// descendantes pour un livrable/parent (même logique que Planning/Budget). `champ` = 'jours_prev'
// ou 'jours_realises' selon la vue voulue.
function chargeNoeud(node, allNodes, champ) {
  return getLeaves(node, allNodes)
    .flatMap((l) => l.affectations || [])
    .reduce((s, a) => s + (a[champ] || 0), 0);
}

// Charge d'un nœud pour un jour ISO précis (même logique de rollup, au jour le jour). `champ` =
// 'planning' (prév.) ou 'planning_reel' (réel).
function chargeNoeudJour(node, allNodes, champ, iso) {
  return getLeaves(node, allNodes)
    .flatMap((l) => l.affectations || [])
    .reduce((s, a) => s + ((a[champ] || {})[iso] || 0), 0);
}

function collaborateursNoeud(node, allNodes, collaborateurs) {
  if (allNodes.some((n) => n.parent_id === node.id)) return [];
  return (node.affectations || [])
    .map((a) => collaborateurs.find((c) => c.id === a.collaborateur_id))
    .filter(Boolean);
}

// Plage de jours (bornes incluses) couvrant les imputations saisies sur le projet, selon la vue :
// 'reel' → planning_reel, 'prev' → planning, 'les_deux' → union des deux. Vide si rien saisi.
export function calculerPlageJours(projet, vue = 'reel') {
  const champs = vue === 'les_deux' ? ['planning', 'planning_reel'] : [vue === 'prev' ? 'planning' : 'planning_reel'];
  const isos = projet.wbs
    .flatMap((n) => n.affectations || [])
    .flatMap((a) => champs.flatMap((champ) => Object.keys(a[champ] || {})))
    .filter(Boolean)
    .sort();
  if (isos.length === 0) return [];
  const days = [];
  let cur = isos[0];
  const fin = isos[isos.length - 1];
  while (cur <= fin) { days.push(cur); cur = addDays(cur, 1); }
  return days;
}

// Conservé pour compat (ancien nom, vue réel par défaut).
export function calculerPlageJoursReels(projet) {
  return calculerPlageJours(projet, 'reel');
}

// Construit les lignes du résumé (une par nœud WBS, dans l'ordre d'affichage) avec, pour
// chacune : numéro, nom, profondeur (indentation), collaborateurs, charges prév./réelle totales,
// statut, et le détail jour par jour sur `jours` (map iso -> { prev, reel }). Les deux charges
// sont toujours calculées (coût négligeable) pour que l'UI/l'export choisissent librement quoi
// afficher selon la vue sélectionnée, sans redemander une construction différente par vue.
export function construireLignesResume(projet, collaborateurs, jours) {
  const numeros = calculerNumeroWBS(projet.wbs);
  return flattenWBS(projet.wbs).map(({ node, depth }) => ({
    id: node.id,
    numero: numeros[node.id] || '',
    nom: node.nom,
    depth,
    isLeaf: !projet.wbs.some((n) => n.parent_id === node.id),
    collaborateurs: collaborateursNoeud(node, projet.wbs, collaborateurs),
    chargePrev: chargeNoeud(node, projet.wbs, 'jours_prev'),
    chargeReelle: chargeNoeud(node, projet.wbs, 'jours_realises'),
    statut: node.statut,
    parJour: Object.fromEntries(jours.map((iso) => [
      iso,
      { prev: chargeNoeudJour(node, projet.wbs, 'planning', iso), reel: chargeNoeudJour(node, projet.wbs, 'planning_reel', iso) },
    ])),
  }));
}

export async function genererClasseurResume(projet, collaborateurs, vue = 'reel') {
  const showPrev = vue === 'prev' || vue === 'les_deux';
  const showReel = vue === 'reel' || vue === 'les_deux';
  const jours = calculerPlageJours(projet, vue);
  const lignes = construireLignesResume(projet, collaborateurs, jours);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Résumé');

  const colsFixes = [
    { header: '#', key: 'numero', width: 8 },
    { header: 'Tâche', key: 'nom', width: 50 },
    { header: 'Collaborateur', key: 'collaborateur', width: 26 },
    ...(showPrev ? [{ header: 'Charge prév. (j)', key: 'chargePrev', width: 16 }] : []),
    ...(showReel ? [{ header: 'Charge réelle (j)', key: 'chargeReelle', width: 16 }] : []),
    { header: 'Statut', key: 'statut', width: 14 },
  ];
  ws.columns = [
    ...colsFixes,
    ...jours.map((iso) => ({ header: new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }), key: iso, width: vue === 'les_deux' ? 9 : 6 })),
  ];

  // Titre + sous-titre au-dessus du tableau
  const VUE_LABEL = { reel: 'réel', prev: 'prévisionnel', les_deux: 'prévisionnel & réel' };
  ws.insertRow(1, [projet.nom]);
  ws.insertRow(2, [`Résumé planning (${VUE_LABEL[vue] || vue}) — export du ${new Date().toLocaleDateString('fr-FR')}`]);
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
      ...(showPrev ? { chargePrev: l.chargePrev > 0 ? arrondi(l.chargePrev) : null } : {}),
      ...(showReel ? { chargeReelle: l.chargeReelle > 0 ? arrondi(l.chargeReelle) : null } : {}),
      statut: STATUT_LABELS[l.statut] || l.statut,
      ...Object.fromEntries(jours.map((iso) => {
        const { prev, reel } = l.parJour[iso];
        let val = null;
        if (vue === 'prev') val = prev > 0 ? arrondi(prev) : null;
        else if (vue === 'reel') val = reel > 0 ? arrondi(reel) : null;
        else if (prev > 0 && reel > 0) val = `${arrondi(prev)} / ${arrondi(reel)}`;
        else if (prev > 0) val = arrondi(prev);
        else if (reel > 0) val = arrondi(reel);
        return [iso, val];
      })),
    });

    // Indentation native Excel (pas de tabulations dans le texte — plus fiable à l'ouverture)
    row.getCell('nom').alignment = { indent: l.depth * 2 };
    row.getCell('nom').font = { bold: !l.isLeaf };
    // Les livrables/modules (profondeur 0) ressortent avec un fond légèrement teinté, comme
    // dans le WBS de l'appli — les sous-tâches restent sur fond blanc.
    if (l.depth === 0) {
      colsFixes.map((c) => c.key).forEach((k) => {
        row.getCell(k).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0EFF9' } };
      });
    }
    row.getCell('statut').font = { color: { argb: STATUT_COLORS[l.statut] || 'FF5F5E5A' }, bold: true };
    if (showPrev) {
      row.getCell('chargePrev').alignment = { horizontal: 'right' };
      row.getCell('chargePrev').font = { ...(row.getCell('chargePrev').font || {}), bold: l.chargePrev > 0 };
    }
    if (showReel) {
      row.getCell('chargeReelle').alignment = { horizontal: 'right' };
      row.getCell('chargeReelle').font = { ...(row.getCell('chargeReelle').font || {}), bold: l.chargeReelle > 0 };
    }

    jours.forEach((iso) => {
      const { prev, reel } = l.parJour[iso];
      const cell = row.getCell(iso);
      cell.alignment = { horizontal: 'center' };
      cell.font = { size: 9 };
      if (isWeekendIso(iso)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEECE6' } };
      } else if (vue === 'les_deux' && prev > 0 && reel > 0) {
        // Écart visible d'un coup d'œil : réel qui dépasse le prévisionnel ressort en orange.
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: reel > prev ? 'FFFBEBD0' : 'FFDAEEF8' } };
      } else if ((vue !== 'prev' && reel > 0) || (vue === 'prev' && prev > 0)) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDAEEF8' } };
      }
    });
  });

  ws.views = [{ state: 'frozen', xSplit: colsFixes.length, ySplit: 4 }];
  return wb;
}

export async function exporterResumeExcel(projet, collaborateurs, vue = 'reel') {
  const wb = await genererClasseurResume(projet, collaborateurs, vue);
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const VUE_SUFFIX = { reel: 'réel', prev: 'prévisionnel', les_deux: 'prév-réel' };
  a.download = `${projet.nom} - Résumé (${VUE_SUFFIX[vue] || vue}).xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

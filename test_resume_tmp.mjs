const mod = await import('./src/utils/resumeExport.js');

const projet = {
  nom: 'RATP',
  wbs: [
    { id: 'n1', parent_id: null, nom: 'Module 1', statut: 'en_cours', ordre: 1, affectations: [] },
    { id: 'n2', parent_id: 'n1', nom: 'Tache A', statut: 'termine', ordre: 1, affectations: [
      { id: 'a1', collaborateur_id: 'c1', jours_prev: 2, jours_realises: 1.5, planning: { '2026-06-01': 1, '2026-06-02': 1 }, planning_reel: { '2026-06-01': 1, '2026-06-02': 0.5 } },
    ]},
  ],
};
const collaborateurs = [{ id: 'c1', prenom: 'Jean', nom: 'Dupont', couleur: '#378ADD', initiales: 'JD' }];

for (const vue of ['reel', 'prev', 'les_deux']) {
  const jours = mod.calculerPlageJours(projet, vue);
  const lignes = mod.construireLignesResume(projet, collaborateurs, jours);
  console.log(vue, 'jours=', jours, 'lignes=', JSON.stringify(lignes.map(l => ({nom:l.nom, chargePrev:l.chargePrev, chargeReelle:l.chargeReelle, parJour:l.parJour}))));
  const wb = await mod.genererClasseurResume(projet, collaborateurs, vue);
  await wb.xlsx.writeFile(`/tmp/test_resume_${vue}.xlsx`);
}
console.log('DONE');

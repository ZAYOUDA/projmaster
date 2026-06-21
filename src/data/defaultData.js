import { v4 as uuidv4 } from 'uuid';

const c1 = uuidv4(), c2 = uuidv4(), c3 = uuidv4();
const p1 = uuidv4(), p2 = uuidv4();

// WBS nodes for project 1
const w1_1 = uuidv4(), w1_2 = uuidv4(), w1_3 = uuidv4();
const w1_1_1 = uuidv4(), w1_1_2 = uuidv4();
const w1_2_1 = uuidv4(), w1_2_2 = uuidv4(), w1_2_3 = uuidv4();

// WBS nodes for project 2
const w2_1 = uuidv4(), w2_2 = uuidv4();
const w2_1_1 = uuidv4(), w2_1_2 = uuidv4();
const w2_2_1 = uuidv4(), w2_2_2 = uuidv4();

export const defaultData = {
  collaborateurs: [
    {
      id: c1,
      nom: 'Dupont',
      prenom: 'Jean',
      initiales: 'JD',
      couleur: '#378ADD',
      profil: 'Développeur Senior',
      actif: true,
      conges: {},
    },
    {
      id: c2,
      nom: 'Martin',
      prenom: 'Sophie',
      initiales: 'SM',
      couleur: '#1D9E75',
      profil: 'Chef de Projet',
      actif: true,
      conges: {},
    },
    {
      id: c3,
      nom: 'Bernard',
      prenom: 'Alex',
      initiales: 'AB',
      couleur: '#D4537E',
      profil: 'Designer UX',
      actif: true,
      conges: {},
    },
  ],
  projets: [
    {
      id: p1,
      nom: 'Refonte Site Web',
      description: 'Refonte complète du site corporate avec nouvelle charte graphique et CMS moderne.',
      couleur: '#378ADD',
      statut: 'actif',
      date_debut: '2025-01-06',
      date_fin_prevue: '2025-06-30',
      tjm: [
        { collaborateur_id: c1, montant: 650, devise: 'EUR' },
        { collaborateur_id: c2, montant: 750, devise: 'EUR' },
        { collaborateur_id: c3, montant: 550, devise: 'EUR' },
      ],
      milestones: [
        {
          id: uuidv4(),
          nom: 'Validation maquettes',
          date_prevue: '2025-02-28',
          date_reelle: '2025-03-05',
          statut: 'atteint',
          description: 'Validation des maquettes Figma par le client',
        },
        {
          id: uuidv4(),
          nom: 'Livraison recette',
          date_prevue: '2025-05-31',
          date_reelle: null,
          statut: 'a_venir',
          description: 'Déploiement en environnement de recette',
        },
        {
          id: uuidv4(),
          nom: 'Mise en production',
          date_prevue: '2025-06-30',
          date_reelle: null,
          statut: 'a_venir',
          description: 'Go live officiel',
        },
      ],
      risques: [
        {
          id: uuidv4(),
          titre: 'Retard livraison contenus client',
          description: 'Le client tarde à fournir les textes et visuels définitifs.',
          probabilite: 'elevee',
          impact: 'moyen',
          criticite: 'elevee',
          statut: 'ouvert',
          plan_mitigation: 'Rappels hebdomadaires, utilisation de contenus placeholder en attendant.',
          proprietaire: 'S. Martin',
          date_identification: '2025-02-01',
          date_echeance: '2025-04-30',
        },
        {
          id: uuidv4(),
          titre: 'Incompatibilité CMS',
          description: 'Le CMS choisi pourrait ne pas supporter certaines fonctionnalités requises.',
          probabilite: 'faible',
          impact: 'eleve',
          criticite: 'moyenne',
          statut: 'en_traitement',
          plan_mitigation: 'POC technique en cours pour valider la faisabilité.',
          proprietaire: 'J. Dupont',
          date_identification: '2025-01-15',
          date_echeance: '2025-03-15',
        },
      ],
      wbs: [
        {
          id: w1_1, parent_id: null, ordre: 1, nom: 'Analyse & Conception',
          description: 'Phase de découverte et conception UX/UI', type: 'livrable', niveau: 1,
          date_debut_prev: '2025-01-06', date_fin_prev: '2025-02-28',
          date_debut_reel: '2025-01-06', date_fin_reel: '2025-03-05',
          avancement: 100, statut: 'termine', kanban_colonne: 'done', affectations: [],
        },
        {
          id: w1_1_1, parent_id: w1_1, ordre: 1, nom: 'Audit de l\'existant',
          description: 'Analyse du site actuel et recueil des besoins', type: 'tache', niveau: 2,
          date_debut_prev: '2025-01-06', date_fin_prev: '2025-01-17',
          date_debut_reel: '2025-01-06', date_fin_reel: '2025-01-17',
          avancement: 100, statut: 'termine', kanban_colonne: 'done',
          affectations: [
            { id: uuidv4(), collaborateur_id: c2, jours_prev: 5, jours_realises: 5 },
            { id: uuidv4(), collaborateur_id: c3, jours_prev: 3, jours_realises: 3 },
          ],
        },
        {
          id: w1_1_2, parent_id: w1_1, ordre: 2, nom: 'Maquettes Figma',
          description: 'Création des wireframes et maquettes haute fidélité', type: 'tache', niveau: 2,
          date_debut_prev: '2025-01-20', date_fin_prev: '2025-02-28',
          date_debut_reel: '2025-01-20', date_fin_reel: '2025-03-05',
          avancement: 100, statut: 'termine', kanban_colonne: 'done',
          affectations: [
            { id: uuidv4(), collaborateur_id: c3, jours_prev: 20, jours_realises: 22 },
          ],
        },
        {
          id: w1_2, parent_id: null, ordre: 2, nom: 'Développement',
          description: 'Intégration et développement des fonctionnalités', type: 'livrable', niveau: 1,
          date_debut_prev: '2025-03-03', date_fin_prev: '2025-05-30',
          date_debut_reel: '2025-03-10', date_fin_reel: null,
          avancement: 45, statut: 'en_cours', kanban_colonne: 'en_cours', affectations: [],
        },
        {
          id: w1_2_1, parent_id: w1_2, ordre: 1, nom: 'Mise en place CMS',
          description: 'Installation et configuration du CMS', type: 'tache', niveau: 2,
          date_debut_prev: '2025-03-03', date_fin_prev: '2025-03-21',
          date_debut_reel: '2025-03-10', date_fin_reel: '2025-03-28',
          avancement: 100, statut: 'termine', kanban_colonne: 'done',
          affectations: [
            { id: uuidv4(), collaborateur_id: c1, jours_prev: 10, jours_realises: 12 },
          ],
        },
        {
          id: w1_2_2, parent_id: w1_2, ordre: 2, nom: 'Intégration HTML/CSS',
          description: 'Intégration des maquettes en HTML/CSS responsive', type: 'tache', niveau: 2,
          date_debut_prev: '2025-03-24', date_fin_prev: '2025-04-25',
          date_debut_reel: '2025-04-01', date_fin_reel: null,
          avancement: 60, statut: 'en_cours', kanban_colonne: 'en_cours',
          affectations: [
            { id: uuidv4(), collaborateur_id: c1, jours_prev: 25, jours_realises: 15 },
            { id: uuidv4(), collaborateur_id: c3, jours_prev: 5, jours_realises: 2 },
          ],
        },
        {
          id: w1_2_3, parent_id: w1_2, ordre: 3, nom: 'Tests & recette',
          description: 'Tests fonctionnels et correction des anomalies', type: 'tache', niveau: 2,
          date_debut_prev: '2025-04-28', date_fin_prev: '2025-05-30',
          date_debut_reel: null, date_fin_reel: null,
          avancement: 0, statut: 'non_demarre', kanban_colonne: 'todo',
          affectations: [
            { id: uuidv4(), collaborateur_id: c2, jours_prev: 10, jours_realises: 0 },
            { id: uuidv4(), collaborateur_id: c1, jours_prev: 5, jours_realises: 0 },
          ],
        },
        {
          id: w1_3, parent_id: null, ordre: 3, nom: 'Mise en production',
          date_prevue: '2025-06-30',
          description: 'Déploiement et mise en ligne', type: 'jalon', niveau: 1,
          date_debut_prev: '2025-06-30', date_fin_prev: '2025-06-30',
          date_debut_reel: null, date_fin_reel: null,
          avancement: 0, statut: 'non_demarre', kanban_colonne: 'backlog', affectations: [],
        },
      ],
    },
    {
      id: p2,
      nom: 'Application Mobile RH',
      description: 'Développement d\'une app mobile pour la gestion des congés et notes de frais.',
      couleur: '#1D9E75',
      statut: 'actif',
      date_debut: '2025-03-01',
      date_fin_prevue: '2025-09-30',
      tjm: [
        { collaborateur_id: c1, montant: 700, devise: 'EUR' },
        { collaborateur_id: c2, montant: 750, devise: 'EUR' },
      ],
      milestones: [
        {
          id: uuidv4(),
          nom: 'Spécifications validées',
          date_prevue: '2025-03-31',
          date_reelle: '2025-03-28',
          statut: 'atteint',
          description: 'Validation du cahier des charges fonctionnel',
        },
        {
          id: uuidv4(),
          nom: 'MVP disponible',
          date_prevue: '2025-06-30',
          date_reelle: null,
          statut: 'a_venir',
          description: 'Version minimale fonctionnelle pour tests utilisateurs',
        },
      ],
      risques: [
        {
          id: uuidv4(),
          titre: 'Contraintes RGPD',
          description: 'Les données RH sont sensibles et nécessitent une conformité RGPD stricte.',
          probabilite: 'moyenne',
          impact: 'eleve',
          criticite: 'elevee',
          statut: 'ouvert',
          plan_mitigation: 'Audit juridique prévu, chiffrement des données.',
          proprietaire: 'S. Martin',
          date_identification: '2025-03-01',
          date_echeance: '2025-04-15',
        },
      ],
      wbs: [
        {
          id: w2_1, parent_id: null, ordre: 1, nom: 'Spécifications',
          description: 'Rédaction des spécifications fonctionnelles et techniques', type: 'livrable', niveau: 1,
          date_debut_prev: '2025-03-01', date_fin_prev: '2025-03-31',
          date_debut_reel: '2025-03-01', date_fin_reel: '2025-03-28',
          avancement: 100, statut: 'termine', kanban_colonne: 'done', affectations: [],
        },
        {
          id: w2_1_1, parent_id: w2_1, ordre: 1, nom: 'Expression de besoins',
          description: 'Ateliers avec les équipes RH', type: 'tache', niveau: 2,
          date_debut_prev: '2025-03-01', date_fin_prev: '2025-03-14',
          date_debut_reel: '2025-03-01', date_fin_reel: '2025-03-14',
          avancement: 100, statut: 'termine', kanban_colonne: 'done',
          affectations: [
            { id: uuidv4(), collaborateur_id: c2, jours_prev: 8, jours_realises: 8 },
          ],
        },
        {
          id: w2_1_2, parent_id: w2_1, ordre: 2, nom: 'Rédaction CDC',
          description: 'Cahier des charges détaillé', type: 'tache', niveau: 2,
          date_debut_prev: '2025-03-17', date_fin_prev: '2025-03-31',
          date_debut_reel: '2025-03-17', date_fin_reel: '2025-03-28',
          avancement: 100, statut: 'termine', kanban_colonne: 'done',
          affectations: [
            { id: uuidv4(), collaborateur_id: c2, jours_prev: 5, jours_realises: 4 },
          ],
        },
        {
          id: w2_2, parent_id: null, ordre: 2, nom: 'Développement MVP',
          description: 'Développement des fonctionnalités core', type: 'livrable', niveau: 1,
          date_debut_prev: '2025-04-01', date_fin_prev: '2025-06-30',
          date_debut_reel: '2025-04-07', date_fin_reel: null,
          avancement: 20, statut: 'en_cours', kanban_colonne: 'en_cours', affectations: [],
        },
        {
          id: w2_2_1, parent_id: w2_2, ordre: 1, nom: 'Architecture technique',
          description: 'Mise en place de l\'architecture et des fondations', type: 'tache', niveau: 2,
          date_debut_prev: '2025-04-01', date_fin_prev: '2025-04-18',
          date_debut_reel: '2025-04-07', date_fin_reel: '2025-04-25',
          avancement: 100, statut: 'termine', kanban_colonne: 'done',
          affectations: [
            { id: uuidv4(), collaborateur_id: c1, jours_prev: 10, jours_realises: 12 },
          ],
        },
        {
          id: w2_2_2, parent_id: w2_2, ordre: 2, nom: 'Module congés',
          description: 'Fonctionnalité de gestion des congés', type: 'tache', niveau: 2,
          date_debut_prev: '2025-04-22', date_fin_prev: '2025-05-30',
          date_debut_reel: '2025-04-28', date_fin_reel: null,
          avancement: 30, statut: 'en_cours', kanban_colonne: 'en_cours',
          affectations: [
            { id: uuidv4(), collaborateur_id: c1, jours_prev: 25, jours_realises: 7 },
          ],
        },
      ],
    },
  ],
};

# SPEC V5 — Change Requests, Échéancier (dépendances + chemin critique), Ressources (charge portefeuille)

Statut : **brouillon, à valider avant tout développement**.
Périmètre : 3 fonctionnalités demandées pour renforcer la rigueur PMP de l'outil. Chaque section
propose un modèle de données concret (ancré dans le schéma Firestore actuel de `projet`), une UI,
et surtout une liste de **décisions à trancher ensemble** avant de coder — ce sont les points où
plusieurs designs sont possibles et où le choix a un vrai impact sur l'effort/la UX.

Rappel du modèle actuel utile pour la suite : un `projet` est un document Firestore unique, `wbs`
est un tableau plat de nœuds avec `parent_id`, `migrateProjet()` (dans `useAppStore.js`) backfill
les champs manquants sur chaque lecture — donc ajouter un champ à un nœud WBS ou au projet ne
demande pas de migration de données, juste une valeur par défaut dans `migrateProjet()` et dans
les fonctions `addXxx`. Les règles Firestore (`firestore.rules`) autorisent déjà les collaborateurs
autorisés à lire/écrire tout le document `projet` — aucune règle nouvelle n'est nécessaire pour les
3 fonctionnalités ci-dessous puisqu'elles vivent dans ce même document ou dans la collection
`collaborateurs` déjà couverte.

---

## 1. Change Requests — registre des demandes de changement

### Modèle de données
Nouveau tableau `projet.changements`, sur le même pattern que `projet.riad` (registre avec statut
et workflow), mais séparé de RIAD car ce n'est pas un risque/incident : c'est une demande de
modification du périmètre/délai/budget déjà approuvés.

```js
{
  id, numero: 'CR-001',              // auto-incrémenté par projet, affiché
  titre, description,
  categorie: 'perimetre' | 'delai' | 'budget' | 'ressource' | 'technique' | 'autre',
  demandeur,                          // texte libre, ou id d'un stakeholder existant
  date_soumission,
  impact_delai_jours: number | null,  // + ou -, estimation
  impact_budget: number | null,       // + ou -, en euros, estimation
  impact_description: '',             // texte libre qualitatif (risques, dépendances…)
  wbs_lies: [nodeId, ...],            // tâches WBS concernées, optionnel
  priorite: 'faible' | 'moyenne' | 'haute' | 'critique',   // réutilise IMPACT_LEVELS existant
  statut: 'soumise' | 'en_analyse' | 'approuvee' | 'rejetee' | 'implementee' | 'annulee',
  decideur, date_decision, justification_decision,
  date_cible_implementation,
  commentaire,
}
```

### UI
Nouvel onglet **« Changements »** dans `ProjetLayout` (`ALL_TABS`), entre RIAD et Facturation —
même schéma que RIAD : un tableau liste (`RiadModuleTable`-like) + un petit dashboard (nb en
attente, impact budget cumulé des CR approuvées, impact délai cumulé). Le changement de statut se
fait via un picklist comme le `StatutPicker` de Planning/WBS. Export Excel possible plus tard sur
le même modèle que Résumé, mais pas prioritaire en V1.

### Décisions à valider
1. **Qui peut soumettre une CR ?** Admin uniquement, ou aussi les collaborateurs (comme ils
   peuvent déjà saisir du réel sur Planning) ? → impacte `firestore.rules` côté client-gating
   (pas Firestore lui-même, qui autorise déjà l'update).
2. **L'impact budget d'une CR approuvée modifie-t-il automatiquement le budget prévisionnel du
   projet**, ou reste-t-il un chiffre tracé à part (le budget réel restant ajusté manuellement) ?
   Je recommande : **pas d'automatisme** — au passage en « approuvée », proposer un bouton
   « Ajuster le budget » qui pré-remplit la modification mais laisse la main, pour garder une
   trace explicite plutôt qu'un effet de bord silencieux.
3. Faut-il un **workflow d'approbation à plusieurs niveaux** (comme `escalade_niveaux` sur RIAD),
   ou un simple statut « approuvée/rejetée » décidé par une seule personne suffit en V1 ?

---

## 2. Échéancier — dépendances entre tâches + chemin critique

### Modèle de données
Ajout sur chaque nœud WBS (tâche ou jalon) :

```js
predecesseurs: [
  { id: <nodeId>, type: 'FS' | 'SS' | 'FF' | 'SF', lag: <jours, +/-, défaut 0> },
]
```
(FS = Fin→Début, le plus courant ; SS = Début→Début ; FF = Fin→Fin ; SF = Début→Fin, rare).
Défaut `[]`, backfillé dans `migrateProjet()` et dans les défauts de `addWBSNode`.

### Calcul du chemin critique
Algorithme CPM classique sur le graphe formé par `predecesseurs` : passe avant (dates au plus tôt
ES/EF), passe arrière (dates au plus tard LS/LF), marge totale = LS − ES. Les tâches à marge nulle
forment le chemin critique. Nouveau module pur et testé `src/utils/criticalPath.js`, dans l'esprit
de `evmCalculs.js` — logique isolée du composant, pas de calcul inline dans le Gantt.

### UI
- **WBS/Planning** : un moyen d'ajouter des prédécesseurs à une tâche (picklist des autres tâches
  du projet + type + lag) — probablement un petit modal « Dépendances » ouvert depuis la ligne de
  tâche, plutôt qu'une colonne dans un tableau déjà chargé.
- **Gantt** : tracer des flèches SVG entre barres liées, et surligner en rouge/orange les
  tâches du chemin critique (marge = 0). Légende à ajouter.

### Décisions à valider
1. **Dates calculées automatiquement par les dépendances** (vraie planification par contraintes :
   déplacer une tâche recalcule ses successeurs) **ou dates saisies manuellement comme aujourd'hui
   + marge/chemin critique affichés en parallèle** (le calcul CPM tourne « à côté », sans jamais
   écraser `date_debut_prev`/`date_fin_prev` saisies) ? Je recommande de **commencer par la 2ᵉ
   option** — moins invasif, garde le contrôle manuel actuel du planning, et sert d'abord à
   *visualiser* le risque plutôt qu'à automatiser. On peut faire évoluer vers un recalcul auto
   dans une V2 si l'usage le justifie.
2. **Jours calendaires ou jours ouvrés** (hors weekends, congés de la ressource affectée) pour le
   calcul de durée entre deux dates ? Le Planning gère déjà les weekends et les congés par
   collaborateur (`isWeekend`, `congesParCollab`) mais un CPM en jours ouvrés est nettement plus
   complexe (calendrier différent par ressource si une tâche a plusieurs affectations). Je
   recommande de **démarrer en jours calendaires simples** (cohérent avec le Gantt actuel qui
   calcule déjà les durées ainsi), et d'affiner plus tard si besoin.
3. **`projet.milestones` vs nœuds WBS `type: 'jalon'`** : les deux coexistent déjà dans le code
   (`ProjetGantt.jsx` filtre les `type: 'jalon'` hors des barres WBS et affiche `projet.milestones`
   séparément) et ça a l'air d'être deux mécanismes qui se chevauchent plutôt qu'un choix
   délibéré. Pour que l'échéancier ait du sens (un jalon peut être prédécesseur d'une tâche), il
   faut trancher : on unifie les deux, ou les jalons WBS entrent aussi dans le graphe de
   dépendances et `projet.milestones` reste un système à part (jalons "libres", non liés au WBS) ?

---

## 3. Ressources — vue de charge portefeuille (tous projets)

### Constat
Le conflit de ressource est déjà détecté *dans* un projet (`Planning`, badge orange « conflit »),
mais rien n'agrège la charge d'un collaborateur **à travers tous ses projets**. C'est le trou
principal côté gestion de ressources.

### Modèle de données
Rien à changer côté `projet` — la donnée existe déjà (`affectation.planning` par jour, par projet,
déjà chargée dans le store pour tous les projets). Un seul ajout optionnel à envisager :

```js
// sur collaborateur (collection collaborateurs, aujourd'hui: prenom, nom, initiales, couleur, actif, conges)
capacite_jour: 1   // 1 = temps plein, 0.8 = 4/5e, etc. — défaut 1 si absent
```

### UI
Nouvelle page (globale, hors d'un projet — accessible depuis la Sidebar, ex. à côté de « Congés »)
: tableau collaborateurs (lignes) × jours/semaines (colonnes), cellule = somme de la charge
planifiée ce jour-là **tous projets confondus**, colorée selon le ratio charge/capacité (vert
sous-chargé, jaune correct, rouge surchargé). Clic sur une cellule → détail des tâches/projets ce
jour pour ce collaborateur. Les congés (déjà trackés) grisent la cellule comme sur Planning.

### Décisions à valider
1. **Vue par projet suffit-elle pour l'instant, ou il faut vraiment une vue portefeuille globale ?**
   (Le besoin exprimé — « ressources » — suggère la vue globale, mais à confirmer : c'est le plus
   gros morceau des 3 fonctionnalités côté volume de données à agréger.)
2. **Capacité configurable par collaborateur** (temps partiel) dès la V1, ou capacité fixe à 1j/j
   pour tout le monde pour commencer (plus simple, ajoutable plus tard sans casser l'existant) ?

---

## 4. Plan de mise en œuvre suggéré

1. **Change Requests** — le plus autonome, réutilise directement le pattern RIAD déjà en place,
   risque de régression faible ailleurs dans l'app.
2. **Ressources / vue portefeuille** — lecture seule, calcul dérivé des données existantes ; pas de
   nouveau champ obligatoire si on démarre sans capacité configurable.
3. **Échéancier / dépendances + chemin critique** — le plus complexe (touche WBS, Planning, Gantt
   et un nouveau module de calcul), à faire en dernier et probablement de façon itérative.

---

## Récapitulatif des questions ouvertes

1. CR : qui peut soumettre (admin seul / tous) ?
2. CR : impact budget approuvé → ajustement auto du budget, ou trace séparée avec bouton manuel ?
3. CR : approbation à un seul niveau ou plusieurs (comme l'escalade RIAD) ?
4. Échéancier : dates auto-recalculées par les dépendances, ou calcul de marge/chemin critique en
   parallèle des dates saisies manuellement (recommandé pour la V1) ?
5. Échéancier : jours calendaires (recommandé pour la V1) ou jours ouvrés ?
6. Échéancier : comment traiter la coexistence `projet.milestones` / WBS `type: 'jalon'` ?
7. Ressources : vue globale portefeuille confirmée comme le besoin réel ?
8. Ressources : capacité par collaborateur configurable dès la V1, ou capacité fixe à 1 ?

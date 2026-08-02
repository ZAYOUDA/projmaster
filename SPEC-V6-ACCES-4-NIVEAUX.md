# Spec — Accès 4 niveaux (Admin / Manager / Chef de Projet / Collaborateur)

Statut : **validé — décisions figées ci-dessous (§9), prêt pour implémentation par packages (§10).**

## 1. Contexte

Aujourd'hui le modèle est binaire : `users/{uid}.role` vaut `admin` ou `collaborateur`.

- **admin** : accès total à tout (toutes les pages, tous les projets), gère les comptes utilisateurs (`ConsoleAdmin`), seul rôle à voir Budget/Facturation/RIAD/Stakeholders/Résumé/Paramètres-projet et le todo perso (`taches`).
- **collaborateur** : accès restreint aux projets listés dans `users/{uid}.projets_autorises` (array d'IDs), et seulement aux onglets WBS/Planning/Gantt/Kanban dans ces projets (voir `ALL_TABS` dans `ProjetLayout.jsx`) ; lecture + mise à jour limitée côté `firestore.rules` (`canAccessProjet`).

Il n'existe **aucun champ de "propriétaire/chef de projet" sur un `projet`** aujourd'hui — seul `projets_autorises` (côté user) détermine l'accès. Il n'y a pas non plus de rôle intermédiaire.

Objectif : passer à 4 rôles sans casser l'existant (les comptes `admin`/`collaborateur` actuels continuent de fonctionner tels quels).

## 2. Les 4 rôles — résumé

| Rôle | Valeur `role` | Accès projets | Peut créer/modifier des projets | Peut gérer les comptes | Vue transverse (facturation, budget) |
|---|---|---|---|---|---|
| **Admin** | `admin` (existant) | Tous | Oui | Oui, tout (créer/modifier/désactiver/supprimer n'importe qui) | Oui |
| **Manager** *(nouveau)* | `manager` | Tous | Oui (créer, modifier, tous onglets) | Oui, **sauf** modifier/désactiver/supprimer un compte Admin | Oui (facturation + budget cross-projets) |
| **Chef de Projet** *(nouveau)* | `chef_projet` | Uniquement ses projets (liste explicite) | Peut créer un nouveau projet (devient automatiquement CDP dessus) ; modification complète sur ses projets uniquement | Non | Non — budget/facturation uniquement sur ses propres projets |
| **Collaborateur** | `collaborateur` (existant, inchangé) | Uniquement ses projets (liste explicite) | Non | Non | Non |

## 3. Matrice de permissions détaillée

Légende : ✅ total · 🟡 limité (précisé) · ❌ aucun

| Fonctionnalité | Admin | Manager | Chef de Projet | Collaborateur |
|---|---|---|---|---|
| Dashboard (vue perso + todo `taches`) | ✅ | ✅ (todo perso propre à son compte) | ✅ (todo perso propre à son compte) | ❌ (inchangé — todo reste réservé PM, voir §8.3) |
| Liste des projets (Sidebar/Dashboard) | Tous | Tous | Ses projets uniquement | Ses projets uniquement |
| Créer un projet | ✅ | ✅ | ✅ (devient CDP du projet créé) | ❌ |
| Modifier infos projet (`ProjetParametres`) | ✅ tous | ✅ tous | 🟡 ses projets uniquement | ❌ |
| Supprimer un projet | ✅ | ✅ | ❌ | ❌ |
| WBS / Planning / Gantt / Kanban | ✅ tous | ✅ tous | 🟡 ses projets | 🟡 ses projets (inchangé) |
| Budget (`ProjetBudget`) | ✅ tous | ✅ tous | 🟡 ses projets | ❌ (inchangé) |
| Facturation par projet (`ProjetFacturation`) | ✅ tous | ✅ tous | 🟡 ses projets | ❌ (inchangé) |
| **Vue Facturation cross-projets** (nouvelle, portefeuille) | ✅ | ✅ | ❌ | ❌ |
| RIAD / Stakeholders / Résumé | ✅ tous | ✅ tous | 🟡 ses projets | ❌ (inchangé) |
| Import CRA / Import WBS | ✅ | ✅ | ❌ | ❌ |
| Assigner des tâches / affectations (WBS) | ✅ | ✅ | 🟡 ses projets | ❌ (peut juste mettre à jour son propre statut/avancement, inchangé) |
| Collaborateurs (fiche, TJM, couleur) | ✅ | ✅ | ❌ (lecture seule, comme collab. aujourd'hui) | 🟡 lecture (inchangé) |
| Congés équipe | ✅ | ✅ | 🟡 lecture (à confirmer, §9) | 🟡 (inchangé, déjà ouvert à tous) |
| **Console Admin (gestion comptes)** | ✅ tout | 🟡 créer/modifier/désactiver Manager, Chef de Projet, Collaborateur — **jamais** un compte Admin | ❌ | ❌ |
| Changer mot de passe d'un autre compte | ✅ tous | 🟡 (mêmes limites que ci-dessus) | ❌ | ❌ |
| Paramètres globaux (export/import/reset données) | ✅ | ✅ | ❌ | ❌ |

## 4. Modèle de données

### 4.1 `users/{uid}` — champ `role`

Ajout de deux valeurs possibles : `manager`, `chef_projet`. Aucun changement de forme, juste deux nouvelles valeurs de l'enum existante.

### 4.2 Réutilisation de `projets_autorises` (proposition retenue)

Plutôt que d'ajouter un nouveau champ (ex. `projets_geres`), on **réutilise `projets_autorises`** (déjà présent, déjà géré dans `ConsoleAdmin` → `EditRightsModal`) pour `chef_projet` exactement comme pour `collaborateur` : la liste des IDs de projets auxquels il a accès.

Ce qui change, c'est **le niveau d'accès à l'intérieur de ces projets**, déterminé par le `role` :
- `role: 'collaborateur'` + `projets_autorises: [...]` → accès actuel inchangé (WBS/Planning/Gantt/Kanban, lecture + affectation)
- `role: 'chef_projet'` + `projets_autorises: [...]` → accès complet à ces projets précis (tous les onglets, écriture)

`admin` et `manager` n'ont pas besoin de `projets_autorises` : accès total indépendamment de ce champ (comme `admin` aujourd'hui).

**Quand un Chef de Projet crée un nouveau projet**, on ajoute automatiquement l'ID du projet créé à son `projets_autorises` (petit changement dans `addProjet` du store).

*Alternative non retenue* : champ dédié `projets_geres` séparé de `projets_autorises`, pour permettre par ex. un Chef de Projet avec accès lecture sur un projet et gestion complète sur un autre. Je pars sur l'option simple (un seul champ, accès uniforme = niveau du rôle) sauf si tu veux cette granularité — **à confirmer, §9**.

### 4.3 Pas de nouveau champ sur `projet`

Pas de `chef_de_projet_id` sur le document `projet` lui-même : la relation projet ↔ CDP se déduit en cherchant, côté client, les users `chef_projet` dont `projets_autorises` contient l'ID (utile uniquement pour un affichage "CDP : Untel" si besoin, pas structurant pour les règles d'accès).

## 5. Logique d'accès (client + règles)

Nouvelle fonction pivot (remplace les checks épars `role === 'admin'`) :

```js
// src/hooks/useAuth.jsx — ajouts
const role = userDoc?.role;
const isAdmin = role === 'admin';
const isManager = role === 'manager';
const isChefProjet = role === 'chef_projet';
const isCollab = role === 'collaborateur';
const hasFullAccess = isAdmin || isManager;              // voit tout, tous projets
const canManageUsers = isAdmin || isManager;              // Console Admin (avec restriction §6)
const canAccessProjet = (projetId) =>
  hasFullAccess || (userDoc?.projets_autorises || []).includes(projetId);
const canManageProjet = (projetId) =>                     // écriture complète sur CE projet
  hasFullAccess || (isChefProjet && canAccessProjet(projetId));
```

Exposés via `useAuth()` pour remplacer les `userDoc?.role !== 'admin'` disséminés dans `ProtectedRoute`, `AdminRoute`, `Sidebar`, `ProjetLayout` (`ALL_TABS`), `ConsoleAdmin`.

### 5.1 Onglets projet (`ProjetLayout.jsx`)

`ALL_TABS` passe de `roles: ['admin']` / `roles: ['admin', 'collaborateur']` à des listes incluant `manager` et `chef_projet` là où c'est pertinent (Budget/Facturation/RIAD/Stakeholders/Résumé/Paramètres → `['admin', 'manager', 'chef_projet']` ; WBS/Planning/Gantt/Kanban → `['admin', 'manager', 'chef_projet', 'collaborateur']`).

## 6. Firestore Rules — proposition

```
function getRole() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
}
function isAdmin()   { return request.auth != null && getRole() == "admin"; }
function isManager() { return request.auth != null && getRole() == "manager"; }
function isChefProjet() { return request.auth != null && getRole() == "chef_projet"; }
function isCollab()  { return request.auth != null && getRole() == "collaborateur"; }
function hasFullAccess() { return isAdmin() || isManager(); }
function canAccessProjet(projetId) {
  return hasFullAccess() ||
    get(/databases/$(database)/documents/users/$(request.auth.uid))
      .data.projets_autorises.hasAny([projetId]);
}
function canManageProjet(projetId) {
  return hasFullAccess() || (isChefProjet() && canAccessProjet(projetId));
}

match /users/{userId} {
  allow read: if request.auth.uid == userId || hasFullAccess();
  // Manager ne peut jamais écrire sur un compte dont le rôle actuel OU le rôle cible est admin
  allow write: if isAdmin() ||
    (isManager()
     && resource.data.role != "admin"
     && request.resource.data.role != "admin");
  allow create: if isAdmin() || (isManager() && request.resource.data.role != "admin");
  allow update: if request.auth.uid == userId
                && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['derniere_connexion']);
}

match /collaborateurs/{collabId} {
  allow read: if hasFullAccess() || isChefProjet() || isCollab();
  allow write: if hasFullAccess();
}

match /projets/{projetId} {
  allow read, write: if hasFullAccess();
  allow read, write: if canManageProjet(projetId);   // chef_projet sur ses projets
  allow read: if isCollab() && canAccessProjet(projetId);
  allow update: if isCollab() && canAccessProjet(projetId);
}

match /app_config/{doc} {
  allow read, write: if hasFullAccess();
}

match /taches/{tacheId} {
  // todo perso — désormais partagé Admin/Manager/CDP, chacun ne voit/modifie que le sien
  allow read, write: if hasFullAccess() || isChefProjet();
}
```

Point d'attention Firestore : la règle `write` sur `users/{userId}` combine `create`/`update`/`delete` — `resource.data` n'existe pas en `create` (nouveau doc), donc en pratique il faut splitter proprement `allow create` / `allow update` / `allow delete` (esquissé ci-dessus, à affiner en implémentation — le pseudo-code montre l'intention, pas le code final).

## 7. Console Admin — UI

- `CreateUserModal` : dropdown rôle passe de 2 à 4 options (Collaborateur / Chef de Projet / Manager / Admin). Le bloc "Projets accessibles" (checkboxes) s'affiche pour `collaborateur` **et** `chef_projet` (pas pour `admin`/`manager`, qui ont tout par nature).
- Liste des comptes : au lieu de 2 sections (Admins / Collaborateurs), 4 sections ou un filtre par rôle. Badge couleur par rôle.
- Actions (changer mdp, désactiver, gérer accès projets) : si l'utilisateur connecté est `manager`, ces boutons sont **masqués/désactivés** sur les lignes dont le rôle est `admin` (garde-fou visuel en plus de la règle Firestore).
- Qui voit la page `/admin` : aujourd'hui `AdminRoute` (role admin strict) → devient accessible à `admin` **et** `manager`.

## 8. Cas particuliers

### 8.1 Manager ne peut jamais toucher un compte Admin
Vérifié à 2 niveaux : UI (boutons masqués) + règle Firestore (§6). Un Manager ne peut ni changer le rôle d'un Admin, ni le désactiver, ni changer son mot de passe, ni le supprimer. Il peut créer/modifier/désactiver Collaborateur/Chef de Projet/Manager.

*Question ouverte* : un Manager peut-il créer un autre **Manager**, ou seul l'Admin le peut ? Le brief dit juste "pas supprimer l'admin", donc par défaut je pars sur **Manager peut créer un autre Manager** — à confirmer, §9.

### 8.2 Chef de Projet et création de projet
Un CDP qui crée un projet en devient automatiquement CDP (ajout auto à son `projets_autorises`). S'il faut qu'un Admin/Manager assigne *ensuite* un CDP différent (ou plusieurs) sur ce projet, ça passe par `EditRightsModal` (déjà générique, fonctionne pour n'importe quel rôle avec `projets_autorises`).

### 8.3 Todo personnel (`taches`) — strictement personnel (décidé)
Vérifié dans le code : `subscribeTaches()` (`firestore.js`) souscrit à toute la collection sans filtre — aujourd'hui un pool partagé de fait, ça marchait car un seul compte Admin l'utilisait. Avec Manager/CDP qui ont chacun leur propre "Mes actions", il faut :
- Ajouter `owner_id` (uid) sur chaque `tache`, renseigné dans `addTache` (store) à partir de l'uid courant stocké en state à l'`init`.
- `subscribeTaches` prend un paramètre `uid` et filtre via `where('owner_id', '==', uid)`.
- `firestore.rules` : `taches` lisible/écrivable uniquement si `resource.data.owner_id == request.auth.uid` (et rôle admin/manager/chef_projet — collaborateur reste exclu, cf. §3).
- **Migration** : les `tache` existantes (créées avant ce changement par l'unique compte Admin actuel) n'ont pas de `owner_id`. Étape ponctuelle en Package 1 : patcher ces documents avec `owner_id: <uid de l'admin actuel>` avant de déployer la règle stricte (sinon elles deviennent invisibles/orphelines).

### 8.4 Vue Facturation cross-projets (nouvelle page) — dans ce lot (décidé)
C'est la seule vraie **nouvelle fonctionnalité** de ce lot (le reste est de la réorganisation d'accès). Proposition minimale pour une v1 :
- Nouvelle page `/facturation` (hors `projet/:id/...`), réservée Admin/Manager.
- Reprend les KPIs déjà calculés par projet dans `ProjetFacturation.jsx` (`OngletFactures` : total facturé, encaissé, en attente, reste à facturer) et les agrège sur tous les projets, avec un tableau projet × mois.
- Pas d'édition ici (lecture seule), juste un portefeuille consolidé — l'édition reste dans `ProjetFacturation` par projet.

Livré dans ce lot (dernier package, une fois le RBAC en place — voir §10).

### 8.5 Rétrocompatibilité
Aucune migration de données requise : les comptes existants ont déjà `role: 'admin'` ou `role: 'collaborateur'`, valeurs qui restent valides et se comportent exactement comme avant. `manager`/`chef_projet` sont des ajouts purs, aucun champ renommé/supprimé.

## 9. Décisions (validées avec l'utilisateur)

1. Manager peut créer un autre Manager. ✅
2. Chef de Projet : accès uniforme, uniquement sur ses propres projets (`projets_autorises`, pas de modulation lecture/écriture par projet). ✅
3. `taches` (todo perso) : strictement personnel — `owner_id` par tâche, migration des tâches existantes en Package 1 (§8.3). ✅
4. Congés équipe : Chef de Projet voit tout le monde, comme aujourd'hui (pas de restriction supplémentaire). ✅
5. Vue Facturation cross-projets : livrée dans ce lot (dernier package). ✅
6. Nom du rôle : `chef_projet`. ✅

## 10. Découpage en packages

1. **Package 1 — Fondations rôles** : `useAuth` (helpers `isAdmin/isManager/isChefProjet/isCollab/hasFullAccess/canAccessProjet/canManageProjet`), `firestore.rules` (nouvelles fonctions + règles `users`/`projets`/`collaborateurs`/`app_config`/`taches`), `owner_id` sur `taches` (store + `subscribeTaches` filtré + migration des tâches existantes).
2. **Package 2 — Console Admin** : dropdown 4 rôles, sections/filtre par rôle, garde-fous UI Manager→Admin (boutons masqués sur les comptes Admin).
3. **Package 3 — Onglets & routing projet** : `ProjetLayout` `ALL_TABS`, `ProtectedRoute`/`AdminRoute` généralisés (accès Manager à `/admin` et `/import-cra`), Sidebar.
4. **Package 4 — Création de projet par Chef de Projet** : bouton "Nouveau projet" visible pour `chef_projet`, auto-ajout à `projets_autorises` du créateur.
5. **Package 5 — Vue Facturation cross-projets** : nouvelle page portefeuille (lecture seule, agrégée par projet × mois), réservée Admin/Manager.

Chaque package : dev branch only (`feature/v4-post-launch` ou nouvelle branche dédiée à valider), commit + vérif avant de passer au suivant, comme d'habitude. Package 1 en premier — c'est le socle dont tout le reste dépend (rules Firestore notamment, à tester avec soin avant de construire dessus).

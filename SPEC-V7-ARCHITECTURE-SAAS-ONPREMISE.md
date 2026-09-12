# SPEC V7 — Architecture cible : commercialisation SaaS + On-Premise

Statut : décisions de principe validées (2026-08-13), pas encore implémenté. Ce document fige les choix pris pendant la session de brainstorming architecture, pour éviter de les re-débattre plus tard et pour servir de point de départ à l'implémentation.

## 1. Objectif

Commercialiser ProjMaster selon deux canaux :
- **SaaS** — plusieurs clients (tenants) utilisent l'application hébergée par nous, sur un nom de domaine propre.
- **On-premise** — un client installe l'application sur son propre serveur, y compris en environnement sans accès internet sortant (air-gapped).

Contraintes posées par l'utilisateur : sécurité forte entre clients (non négociable), opération par une seule personne avec du temps limité, viser un grand nombre de petits clients plutôt que quelques gros comptes, coût d'infrastructure minimal.

## 2. Décisions prises

| Sujet | Décision | Raison |
|---|---|---|
| Hébergement | VPS OVH, auto-géré (pas de PaaS type Vercel pour le backend) | Contrôle total nécessaire pour héberger un vrai backend + DB, condition préalable au on-premise |
| Nom de domaine | Domaine propre, DNS pointé vers le VPS | Indépendant du choix d'hébergement (aurait aussi marché avec Vercel, mais tranché en faveur du VPS) |
| TLS / reverse proxy | Caddy (certificats Let's Encrypt automatiques) | Simple à opérer seul, pas de gestion manuelle de certificats |
| Base de données | PostgreSQL auto-hébergé, via le stack **Supabase self-hosted** (Docker Compose) | Postgres = portable (même moteur en SaaS et en on-premise) ; Supabase fournit Auth + Realtime + Row Level Security "clé en main", évite d'écrire ces briques soi-même en solo. Le repo a déjà une ébauche legacy (`src/data/supabase.js`), point de départ possible. |
| Isolation multi-tenant | **1 base Postgres par client**, toutes hébergées sur le même serveur Postgres (pas 1 serveur par client) | Isolation forte (une faille de code ne peut pas faire fuiter les données d'un autre tenant) tout en restant gérable seul et peu coûteux — le coût marginal par nouveau client est quasi nul si le provisioning est scripté |
| Routage tenant | Domaine unique (`app.tondomaine.com`), connexion par email/mot de passe, le backend résout le tenant à partir du compte connecté | Plus simple à configurer (1 seul certificat TLS) qu'un sous-domaine par client ; réévaluable plus tard si le besoin de branding par client apparaît |
| Packaging on-premise | Même image Docker que la version SaaS, déployée chez le client en configuration mono-tenant | Un seul code applicatif à maintenir pour les deux canaux, pas deux produits séparés |
| Coût DB | Self-hosted sur la VPS déjà louée plutôt qu'un service managé (ex. OVH Public Cloud Databases) | Le managé facture par nœud de calcul + stockage, et impose 2 nœuds minimum en tier production (coût doublé) — le self-hosted n'ajoute aucun coût par rapport à la VPS déjà payée |

## 3. Schéma d'architecture

```
Utilisateurs (multi-clients)
        │
        ▼
tondomaine.com — DNS + TLS auto (Caddy)
        │
        ├──────────────────────┐
        ▼                      ▼
  SaaS — VPS OVH          On-Premise — site client
  ┌─────────────────┐     ┌─────────────────┐
  │ Frontend + API   │ ◄─ même image Docker ─► │ Frontend + API   │
  │ (Docker)         │                     │ (Docker)         │
  ├─────────────────┤                     ├─────────────────┤
  │ Supabase         │                     │ Supabase         │
  │ self-hosted      │                     │ self-hosted      │
  │ (Auth, Realtime) │                     │ (Auth, Realtime) │
  ├─────────────────┤                     ├─────────────────┤
  │ DB registre      │                     │ DB mono-tenant   │
  │ tenants          │                     │ isolée, locale   │
  ├─────────────────┤                     │ (air-gapped OK)  │
  │ DB par tenant    │                     └─────────────────┘
  │ (A, B, C…)       │
  └─────────────────┘
```

Un diagramme visuel équivalent a été généré pendant la session (voir historique de conversation).

## 4. Détail par couche

### 4.1 Réseau / sécurité périmètre
- Seul le reverse proxy (Caddy) écoute sur le port 443 côté VPS. La base de données n'est jamais exposée directement à internet.
- Firewall VPS : uniquement 22 (SSH, idéalement restreint par IP), 80/443 ouverts.
- Secrets (clés API, credentials DB) en variables d'environnement, jamais committées.

### 4.2 Isolation des données
- Row Level Security (RLS) Postgres activée sur chaque table, en complément de la séparation physique par base — défense en profondeur : même une erreur de code applicatif ne doit pas pouvoir faire fuiter les données entre tenants.
- Une base "registre" (control plane) stocke la correspondance compte utilisateur → tenant → base cible. Les données métier (projets, WBS, RIAD, etc.) vivent exclusivement dans la base du tenant concerné.

### 4.3 Sauvegardes
- `pg_dump` automatisé par tenant (nightly), poussé vers du stockage objet (ex. OVH Object Storage, peu coûteux).
- À traiter avant le premier client payant, pas après.

### 4.4 Conformité
- Hébergement VPS en France/UE (OVH) → simplifie la conformité RGPD pour une clientèle française.

## 5. On-premise

- Livraison : Docker Compose packagé, configuration mono-tenant (pas besoin de la base "registre" ni du routage multi-tenant).
- Mise à jour : nouvelle image taguée + `docker compose pull && up -d`.
- Licence : pas de vérification en ligne possible pour un client air-gapped — traité contractuellement au départ. Une vérification de clé locale à durée limitée reste une option à ajouter plus tard pour les clients non air-gapped.

## 6. Migration depuis l'existant (Firebase)

La prod actuelle (Firestore + Firebase Auth, hébergée sur Vercel) sert 3 utilisateurs réels — pas de bascule à chaud.

Séquence proposée :
1. Monter le nouveau stack (VPS + Supabase self-hosted) en parallèle, sans toucher à la prod actuelle.
2. Répliquer le schéma de données (projets, WBS, RIAD, EVM, etc.) en Postgres.
3. Écrire un script de migration en s'appuyant sur l'export JSON déjà existant (`exportData`/`importData` dans `Parametres.jsx`) comme point de départ, plutôt que de repartir de zéro.
4. Tester intégralement sur la base `sandbox` avant tout export/import touchant `prod`.
5. Toute bascule réelle de production reste soumise à la règle existante du projet : validation explicite "GO OFFICIEL" avant toute action de production (voir `CLAUDE.md`).

## 7. Coûts estimés (démarrage)

- VPS OVH (VPS-2, 6 vCores / 12 Go RAM / 100 Go NVMe) : ~9 à 12 €HT/mois.
- Nom de domaine : quelques €/an selon registrar et extension.
- Object storage pour sauvegardes : coût marginal, quelques centimes/Go/mois.
- Total de départ : de l'ordre de 15-20 €/mois avant tout coût de scaling.

## 8. Points ouverts / à trancher plus tard

- Choix définitif du registrar de domaine.
- Détail du script de provisioning automatique d'un nouveau tenant (création DB + migration + compte admin initial).
- Mécanisme de licence pour le on-premise (contractuel simple vs vérification technique).
- Stratégie de scaling si le nombre de tenants ou le volume de données dépasse la capacité d'une seule VPS (séparation app/DB sur deux VPS, ou sharding par groupe de tenants).
- Monitoring/alerting (uptime, erreurs applicatives) — non couvert dans cette session.

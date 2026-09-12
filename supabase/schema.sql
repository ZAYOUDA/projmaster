-- Schéma Postgres de ProjMaster (modèle hybride relationnel + JSONB), versionné dans le repo.
-- Copie de référence de ce qui tourne sur la VPS (~/projmaster-infra/schema.sql) — toute
-- modification doit être appliquée aux deux endroits. Sert aussi de modèle pour provisionner la
-- base de chaque nouveau tenant (cf. SPEC-V7-ARCHITECTURE-SAAS-ONPREMISE.md).

create extension if not exists pgcrypto;

-- client = profil externe en lecture seule, scopé à (généralement) 1 seul projet via
-- projets_autorises (même mécanique de scope que collaborateur/chef_projet, jamais de
-- surcharge par projet comme projets_roles) — cf. firestore.rules isClient()/useAuth.jsx.
create type user_role as enum ('admin', 'manager', 'chef_projet', 'collaborateur', 'client');

-- ── Users (id = auth.users.id de Supabase Auth) ────────────────────
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nom text,
  prenom text,
  -- Pas de contrainte `references collaborateurs(id)` : dépendance circulaire avec
  -- collaborateurs.user_id (même souci que le lien bidirectionnel non contraint côté Firestore).
  collaborateur_id uuid,
  role user_role not null default 'collaborateur',
  -- Rôle par projet : surcharge le `role` global pour un projet précis (ex. chef de projet sur
  -- l'un, collaborateur sur l'autre). Absence d'entrée pour un projet = on retombe sur `role`
  -- (cf. roleSurProjet()/isChefProjetSur() côté firestore.rules, même sémantique ici).
  projets_roles jsonb not null default '{}'::jsonb,
  projets_autorises uuid[] not null default '{}',
  -- Force le changement de mot de passe à la prochaine connexion (première connexion avec un mot
  -- de passe créé par l'admin, ou après une réinitialisation admin).
  doit_changer_mdp boolean not null default false,
  actif boolean not null default true,
  derniere_connexion timestamptz,
  created_at timestamptz not null default now()
);

-- ── Collaborateurs ───────────────────────────────────────────────
create table collaborateurs (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  prenom text not null,
  initiales text,
  actif boolean not null default true,
  conges jsonb not null default '{}'::jsonb,
  user_id uuid references users(id),
  role text,
  organisation text,
  ordre integer
);

-- ── Projets (hybride : colonnes simples + JSONB pour wbs/riad/factures/...) ─
create table projets (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  type text not null default 'BUILD',
  statut text not null default 'actif',
  couleur text,
  date_debut date,
  date_fin date,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Taches (to-do perso, jamais partagée) ──────────────────────────
create table taches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id),
  titre text not null,
  statut text not null default 'a_faire',
  deadline date,
  created_at timestamptz not null default now()
);

-- ── Fonctions RLS (traduisent getRole()/hasFullAccess()/canAccessProjet() de firestore.rules) ─
create or replace function current_role_name() returns user_role
language sql stable as $$
  select role from users where id = auth.uid();
$$;

create or replace function has_full_access() returns boolean
language sql stable as $$
  select current_role_name() in ('admin', 'manager');
$$;

create or replace function is_chef_projet() returns boolean
language sql stable as $$
  select current_role_name() = 'chef_projet';
$$;

create or replace function is_collab() returns boolean
language sql stable as $$
  select current_role_name() = 'collaborateur';
$$;

create or replace function is_client() returns boolean
language sql stable as $$
  select current_role_name() = 'client';
$$;

-- Rôle EFFECTIF sur un projet précis : surcharge par projets_roles, sinon repli sur le rôle
-- global (même sémantique que roleSurProjet() côté firestore.rules).
create or replace function role_sur_projet(p_id uuid) returns text
language sql stable as $$
  select coalesce(
    (select projets_roles ->> p_id::text from users where id = auth.uid()),
    current_role_name()::text
  );
$$;

create or replace function is_chef_projet_sur(p_id uuid) returns boolean
language sql stable as $$
  select role_sur_projet(p_id) = 'chef_projet';
$$;

create or replace function is_collab_sur(p_id uuid) returns boolean
language sql stable as $$
  select role_sur_projet(p_id) = 'collaborateur';
$$;

create or replace function can_access_projet(p_id uuid) returns boolean
language sql stable as $$
  select has_full_access() or exists (
    select 1 from users where id = auth.uid() and p_id = any(projets_autorises)
  );
$$;

-- Merge shallow (niveau des clés top-level) dans la colonne data d'un projet, pour reproduire la
-- sémantique de updateDoc(Firestore) côté Postgres — appelée par patchProjet() dans
-- src/supabase/firestore.js. SECURITY INVOKER (par défaut) : respecte la RLS de l'appelant.
create or replace function patch_projet_data(p_id uuid, p_patch jsonb) returns void
language sql as $$
  update projets set data = coalesce(data, '{}'::jsonb) || p_patch, updated_at = now() where id = p_id;
$$;

alter table users enable row level security;
alter table collaborateurs enable row level security;
alter table projets enable row level security;
alter table taches enable row level security;

create policy users_select on users for select
  using (id = auth.uid() or has_full_access());
create policy users_insert on users for insert
  with check (current_role_name() = 'admin' or (current_role_name() = 'manager' and role <> 'admin'));
create policy users_update on users for update
  using (id = auth.uid() or has_full_access())
  with check (id = auth.uid() or has_full_access());
create policy users_delete on users for delete
  using (current_role_name() = 'admin' or current_role_name() = 'manager');

create policy collaborateurs_select on collaborateurs for select
  using (has_full_access() or is_chef_projet() or is_collab() or is_client());
create policy collaborateurs_write on collaborateurs for all
  using (has_full_access()) with check (has_full_access());

create policy projets_select on projets for select
  using (has_full_access() or can_access_projet(id));
create policy projets_insert on projets for insert
  with check (has_full_access() or is_chef_projet());
-- Rôle PAR PROJET (is_..._sur), pas le rôle global : un profil chef de projet sur un projet et
-- collaborateur sur un autre doit suivre son rôle réel sur CE projet précis (même correctif que
-- celui apporté à firestore.rules aujourd'hui).
create policy projets_update on projets for update
  using (has_full_access() or (is_chef_projet_sur(id) and can_access_projet(id)) or (is_collab_sur(id) and can_access_projet(id)))
  with check (has_full_access() or (is_chef_projet_sur(id) and can_access_projet(id)) or (is_collab_sur(id) and can_access_projet(id)));
create policy projets_delete on projets for delete
  using (has_full_access());

create policy taches_all on taches for all
  using (owner_id = auth.uid() and (has_full_access() or is_chef_projet()))
  with check (owner_id = auth.uid() and (has_full_access() or is_chef_projet()));

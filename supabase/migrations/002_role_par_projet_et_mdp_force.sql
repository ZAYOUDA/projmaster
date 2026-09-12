-- Migration incrémentale à appliquer sur la base Postgres déjà en service sur la VPS (elle a des
-- lignes existantes, donc ALTER/CREATE OR REPLACE plutôt que de rejouer schema.sql en entier).
-- Rattrape côté Supabase les deux features ajoutées aujourd'hui côté Firebase/Firestore :
-- rôle chef de projet PAR PROJET (projets_roles) et mot de passe forcé à la première connexion
-- (doit_changer_mdp). Idempotent — peut être relancée sans risque.

alter table users add column if not exists prenom text;
alter table users add column if not exists collaborateur_id uuid;
alter table users add column if not exists projets_roles jsonb not null default '{}'::jsonb;
alter table users add column if not exists doit_changer_mdp boolean not null default false;
alter table users add column if not exists actif boolean not null default true;
alter table users add column if not exists created_at timestamptz not null default now();

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

drop policy if exists projets_update on projets;
create policy projets_update on projets for update
  using (has_full_access() or (is_chef_projet_sur(id) and can_access_projet(id)) or (is_collab_sur(id) and can_access_projet(id)))
  with check (has_full_access() or (is_chef_projet_sur(id) and can_access_projet(id)) or (is_collab_sur(id) and can_access_projet(id)));

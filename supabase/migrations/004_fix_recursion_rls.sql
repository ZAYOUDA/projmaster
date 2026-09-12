-- Corrige une récursion infinie dans les fonctions RLS découverte en testant le rôle Client :
-- current_role_name() lit `users` pour connaître le rôle de l'appelant, mais cette lecture est
-- elle-même soumise à la policy users_select (`id = auth.uid() or has_full_access()`), qui appelle
-- has_full_access() -> current_role_name() -> relit `users` -> re-déclenche la policy -> boucle
-- infinie (erreur Postgres 54001 "stack depth limit exceeded" / PostgREST error=54001).
--
-- Fix standard Supabase : passer ces fonctions en SECURITY DEFINER (+ search_path fixe, requis
-- par sécurité pour toute fonction SECURITY DEFINER) pour qu'elles s'exécutent avec les droits du
-- propriétaire (postgres, qui contourne RLS en tant que superuser) au lieu de re-déclencher la
-- policy à chaque appel. Sans ça, même une simple lecture de SA PROPRE fiche (id = auth.uid())
-- déclenche la récursion, car Postgres n'a pas de garantie de court-circuit sur les quals RLS
-- combinés par OR.

create or replace function current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
  select role from users where id = auth.uid();
$$;

create or replace function role_sur_projet(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select projets_roles ->> p_id::text from users where id = auth.uid()),
    current_role_name()::text
  );
$$;

-- Migration incrémentale pour la base déjà en ligne sur la VPS. Ajoute le rôle "client" (profil
-- externe en lecture seule, scopé à un projet via projets_autorises — même mécanique que
-- collaborateur/chef_projet).
--
-- ALTER TYPE ... ADD VALUE ne peut PAS s'exécuter dans un bloc DO/PL-pgSQL (restriction Postgres
-- liée aux sous-transactions, vraie même en version récente) — d'où l'instruction nue ci-dessous,
-- avec IF NOT EXISTS (disponible depuis PG 9.6) pour rester idempotente sans bloc DO.
alter type user_role add value if not exists 'client';

create or replace function is_client() returns boolean
language sql stable as $$
  select current_role_name() = 'client';
$$;

-- projets_select existe déjà et couvre client via can_access_projet() (générique, pas de rôle
-- particulier requis) — rien à changer côté projets. Seule collaborateurs_select doit s'ouvrir :
-- Résumé/Planning/Kanban affichent les noms/initiales des collaborateurs assignés, sans quoi un
-- Client verrait des profils vides.
drop policy if exists collaborateurs_select on collaborateurs;
create policy collaborateurs_select on collaborateurs for select
  using (has_full_access() or is_chef_projet() or is_collab() or is_client());

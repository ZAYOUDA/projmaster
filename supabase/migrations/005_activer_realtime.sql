-- Active Supabase Realtime sur les tables métier : sans ça, `postgres_changes` ne notifie jamais
-- rien (confirmé par `select * from pg_publication_tables where pubname = 'supabase_realtime'`
-- qui renvoyait 0 ligne), donc subscribeTable() dans src/supabase/firestore.js ne se réveille
-- jamais après une écriture d'un AUTRE onglet/utilisateur — symptôme observé : il faut rafraîchir
-- la page à la main après chaque création de projet/tâche pour voir le résultat.
alter publication supabase_realtime add table projets, collaborateurs, users, taches;

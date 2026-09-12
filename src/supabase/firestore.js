// Équivalent Supabase de src/firebase/firestore.js — même API (mêmes noms de fonctions, mêmes
// signatures), pour rester un remplacement direct le jour de la bascule. Non branché à
// useAppStore.js pour l'instant (voir SPEC-V7-ARCHITECTURE-SAAS-ONPREMISE.md, plan de migration).
//
// Modèle "hybride" pour les projets : nom/type/statut/couleur/date_debut/date_fin sont des
// colonnes réelles dans la table `projets`, tout le reste (wbs, riad, factures, commandes,
// facturation_params, milestones, tjm, stakeholders, reporting_snapshots, consoMensuelle,
// consoNonAffectee, moisVerrouilles, importsCra, escalade_niveaux...) vit dans la colonne
// jsonb `data`, exactement comme dans le document Firestore d'origine. mergeProjetRow /
// splitProjetForWrite font l'aller-retour pour que le reste de l'app (migrateProjet,
// calculations.js) continue de manipuler un objet plat unique, sans savoir que c'est hybride.
import { supabase } from '../data/supabase';

const PROJET_SCALAR_FIELDS = ['nom', 'type', 'statut', 'couleur', 'date_debut', 'date_fin'];

function mergeProjetRow(row) {
  if (!row) return row;
  const { data, ...scalars } = row;
  return { ...(data || {}), ...scalars, id: row.id };
}

function splitProjetForWrite(flatData) {
  const rest = { ...flatData };
  const scalars = {};
  delete rest.id; // l'id est géré séparément (paramètre, pas dans le corps de l'update)
  for (const key of PROJET_SCALAR_FIELDS) {
    if (key in rest) {
      scalars[key] = rest[key];
      delete rest[key];
    }
  }
  return { scalars, data: rest };
}

// Abonnement générique : Supabase Realtime ne renvoie que des deltas (postgres_changes), pas un
// snapshot complet comme onSnapshot de Firestore. On refetch la liste entière à chaque
// changement pour préserver la même sémantique "callback reçoit toujours l'état complet" —
// plus simple et plus sûr qu'un merge de deltas côté client, au prix d'un refetch par écriture
// (acceptable au volume de données visé).
function subscribeTable(table, { filterColumn, filterValue, filterIn } = {}, mapRow, callback) {
  let cancelled = false;

  const fetchAll = async () => {
    let q = supabase.from(table).select('*');
    if (filterColumn && filterValue !== undefined) q = q.eq(filterColumn, filterValue);
    if (filterColumn && filterIn) q = q.in(filterColumn, filterIn);
    const { data, error } = await q;
    if (cancelled) return;
    if (error) {
      console.error(`subscribeTable(${table}) — erreur de lecture :`, error);
      return;
    }
    callback((data || []).map(mapRow));
  };

  fetchAll();

  const channel = supabase
    .channel(`${table}-changes-${filterValue ?? 'all'}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table }, fetchAll)
    .subscribe();

  return () => {
    cancelled = true;
    supabase.removeChannel(channel);
  };
}

// ── Collaborateurs ───────────────────────────────────────────────
export function subscribeCollaborateurs(callback) {
  return subscribeTable('collaborateurs', {}, (row) => row, callback);
}

export async function saveCollaborateur(id, data) {
  const { error } = await supabase.from('collaborateurs').upsert({ ...data, id });
  if (error) throw error;
}

export async function patchCollaborateur(id, updates) {
  const { error } = await supabase.from('collaborateurs').update(updates).eq('id', id);
  if (error) throw error;
}

export async function removeCollaborateur(id) {
  const { error } = await supabase.from('collaborateurs').delete().eq('id', id);
  if (error) throw error;
}

// ── Projets ──────────────────────────────────────────────────────
export function subscribeProjets(callback, projetIds = null) {
  // projetIds = null → admin/manager, écoute tout
  // projetIds = [] → collab/chef de projet sans projet, retourne vide immédiatement
  // projetIds = ['id1','id2'] → filtre sur ces IDs
  if (projetIds !== null && projetIds.length === 0) {
    callback([]);
    return () => {};
  }
  const opts = projetIds ? { filterColumn: 'id', filterIn: projetIds } : {};
  return subscribeTable('projets', opts, mergeProjetRow, callback);
}

// Écoute le document utilisateur (pour détecter les changements de projets_autorises)
export function subscribeUserDoc(uid, callback) {
  const channel = supabase
    .channel(`user-doc-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'users', filter: `id=eq.${uid}` }, async () => {
      const doc = await getUserDocRow(uid);
      if (doc) callback(doc);
    })
    .subscribe();

  // Émission initiale, comme onSnapshot
  getUserDocRow(uid).then((doc) => { if (doc) callback(doc); });

  return () => supabase.removeChannel(channel);
}

async function getUserDocRow(uid) {
  const { data, error } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
  if (error) {
    console.error('subscribeUserDoc — erreur de lecture :', error);
    return null;
  }
  return data ? { uid: data.id, ...data } : null;
}

export async function saveProjet(id, flatData) {
  const { scalars, data } = splitProjetForWrite(flatData);
  const { error } = await supabase.from('projets').upsert({ id, ...scalars, data });
  if (error) throw error;
}

// Reproduit la sémantique "merge au niveau des champs top-level" de updateDoc(Firestore) : les
// champs scalaires connus vont dans leur colonne, tout le reste est fusionné (shallow merge, via
// l'opérateur jsonb `||` côté SQL — cf. patch_projet_data() dans schema.sql) dans la colonne data.
export async function patchProjet(id, updates) {
  const { scalars, data } = splitProjetForWrite(updates);
  if (Object.keys(scalars).length > 0) {
    const { error } = await supabase.from('projets').update(scalars).eq('id', id);
    if (error) throw error;
  }
  if (Object.keys(data).length > 0) {
    const { error } = await supabase.rpc('patch_projet_data', { p_id: id, p_patch: data });
    if (error) throw error;
  }
}

export async function removeProjet(id) {
  const { error } = await supabase.from('projets').delete().eq('id', id);
  if (error) throw error;
}

// ── Tâches (to-do personnelle, indépendante des projets) ──────────
export function subscribeTaches(uid, callback) {
  if (!uid) { callback([]); return () => {}; }
  return subscribeTable('taches', { filterColumn: 'owner_id', filterValue: uid }, (row) => row, callback);
}

export async function saveTache(id, data) {
  const { error } = await supabase.from('taches').upsert({ ...data, id });
  if (error) throw error;
}

export async function patchTache(id, updates) {
  const { error } = await supabase.from('taches').update(updates).eq('id', id);
  if (error) throw error;
}

export async function removeTache(id) {
  const { error } = await supabase.from('taches').delete().eq('id', id);
  if (error) throw error;
}

// ── Users (admin) ─────────────────────────────────────────────────
export function subscribeUsers(callback) {
  return subscribeTable('users', {}, (row) => ({ uid: row.id, ...row }), callback);
}

export async function saveUser(uid, data) {
  const { error } = await supabase.from('users').upsert({ ...data, id: uid });
  if (error) throw error;
}

export async function patchUser(uid, updates) {
  const { error } = await supabase.from('users').update(updates).eq('id', uid);
  if (error) throw error;
}

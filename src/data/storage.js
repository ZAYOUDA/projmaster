import { supabase } from './supabase';

const STORAGE_KEY = 'projmaster_data';
const ROW_ID = 'main';

// toISOString() convertit en UTC : pour un Date à minuit local (fuseau UTC+, ex. France), ça
// retombe sur la veille. On formate donc à partir des composants locaux du Date.
function localIso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// Use Supabase when env vars are set, otherwise localStorage
const useSupabase = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export async function loadData() {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('app_state')
      .select('collaborateurs, projets')
      .eq('id', ROW_ID)
      .single();
    if (error || !data) return null;
    return { collaborateurs: data.collaborateurs, projets: data.projets };
  }
  // localStorage fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted */ }
  return null;
}

export async function saveData(data) {
  const payload = { collaborateurs: data.collaborateurs, projets: data.projets };
  if (useSupabase) {
    await supabase.from('app_state').upsert({ id: ROW_ID, ...payload, updated_at: new Date().toISOString() });
    return { ...payload, meta: { version: '1.0', lastSaved: new Date().toISOString() } };
  }
  // localStorage fallback
  const full = { ...payload, meta: { version: '1.0', lastSaved: new Date().toISOString() } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  return full;
}

export function exportData(data) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `misterproject_export_${localIso(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(JSON.parse(e.target.result)); }
      catch { reject(new Error('Fichier JSON invalide')); }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsText(file);
  });
}

// ── Export / import d'un seul projet (migration dev → prod, ou entre bases) ─
// Contrairement à exportData/importData (backup complet), ceci cible un projet précis :
// utile pour recopier un projet de la base sandbox vers la base prod (ou inversement)
// sans écraser le reste des données. Les collaborateurs ne sont PAS inclus dans l'export —
// seuls leurs id sont référencés dans le WBS/TJM/commandes du projet — car les fiches
// collaborateur (et leurs id) diffèrent en général entre sandbox et prod (vrais users vs
// données de test). `collaborateursReferences` liste ces id + noms lisibles au moment de
// l'export, pour que la personne qui importe puisse vérifier/recréer les correspondances
// manquantes côté cible avant ou après l'import (cf. handleImportProjet dans Parametres.jsx).
function collecterCollaborateurIds(projet) {
  const ids = new Set();
  (projet.tjm || []).forEach((t) => t.collaborateur_id && ids.add(t.collaborateur_id));
  (projet.wbs || []).forEach((n) => (n.affectations || []).forEach((a) => a.collaborateur_id && ids.add(a.collaborateur_id)));
  (projet.commandes || []).forEach((c) => (c.lignes || []).forEach((l) => l.collabId && ids.add(l.collabId)));
  return [...ids];
}

export function exportProjetData(projet, collaborateurs = []) {
  const ids = collecterCollaborateurIds(projet);
  const payload = {
    meta: {
      type: 'projmaster_projet_export',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      dbId: import.meta.env.VITE_FIRESTORE_DB_ID || 'default',
    },
    projet,
    collaborateursReferences: ids.map((cid) => {
      const c = collaborateurs.find((x) => x.id === cid);
      return { id: cid, nom: c ? `${c.prenom} ${c.nom}` : null };
    }),
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const slug = (projet.nom || projet.id).toString().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  a.download = `projet_${slug}_${localIso(new Date())}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

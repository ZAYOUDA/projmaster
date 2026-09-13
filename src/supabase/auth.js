// Équivalent Supabase de src/firebase/auth.js.
//
// changeUserPassword (admin réinitialise le mot de passe d'un AUTRE utilisateur) et
// createUserAccount nécessitent l'API Admin de Supabase (service_role key, jamais exposée côté
// navigateur) : elles passent par l'Edge Function `main` (cf. supabase/functions/main/index.ts,
// déployée manuellement sur la VPS sous ~/projmaster-infra/volumes/functions/main/index.ts —
// équivalent Supabase de functions/index.js côté Firebase).
import { supabase } from '../data/supabase';

// Fait l'aller-retour avec l'Edge Function `main` et normalise ses erreurs : `data.error` (un
// code, ex. "forbidden"/"email_already_in_use") devient `err.code`, pour rester dans le même
// contrat que les erreurs Firebase Auth (`e.code === 'auth/email-already-in-use'` ailleurs dans
// le code) même si les codes eux-mêmes diffèrent.
async function callAdminFunction(action, payload) {
  const { data, error } = await supabase.functions.invoke('main', { body: { action, ...payload } });
  if (error) throw error;
  if (data?.error) {
    const err = new Error(data.message || data.error);
    err.code = data.error;
    throw err;
  }
  return data;
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // Mise à jour derniere_connexion — non bloquant (peut échouer si RLS restrictive)
  supabase
    .from('users')
    .update({ derniere_connexion: new Date().toISOString() })
    .eq('id', data.user.id)
    .then(() => {}, () => {});
  return data.user;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getUserDoc(uid) {
  const { data, error } = await supabase.from('users').select('*').eq('id', uid).maybeSingle();
  if (error) throw error;
  return data ? { uid, ...data } : null;
}

// Self-service : l'utilisateur connecté change SON PROPRE mot de passe. On exige de ressaisir le
// mot de passe actuel (choix de sécurité, symétrique à src/firebase/auth.js::changeMyPassword) —
// contrairement à Firebase, Supabase/GoTrue n'impose pas de réauthentification récente par
// défaut pour updateUser(), donc on la simule explicitement via un signInWithPassword.
export async function changeMyPassword(currentPassword, newPassword) {
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData?.session?.user?.email;
  const uid = sessionData?.session?.user?.id;
  if (!email) throw new Error('Aucun utilisateur connecté.');

  const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (reauthError) {
    const err = new Error('Mot de passe actuel incorrect.');
    err.code = 'invalid_credentials';
    throw err;
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  // Si le drapeau était encore posé (cas limite), on le lève aussi ici par cohérence — même
  // logique que src/firebase/auth.js::changeMyPassword.
  await supabase.from('users').update({ doit_changer_mdp: false }).eq('id', uid).then(() => {}, () => {});
}

// Première connexion / suite à une réinitialisation admin : la session vient d'être ouverte
// (login() tout juste appelé), donc pas besoin de réauthentification pour updateUser(). Lève
// ensuite doit_changer_mdp pour ne plus reproposer l'écran bloquant — même contrat que
// terminerPremiereConnexion dans src/firebase/auth.js.
export async function terminerPremiereConnexion(newPassword) {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData?.session?.user?.id;
  if (!uid) throw new Error('Aucun utilisateur connecté.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  const { error: dbError } = await supabase.from('users').update({ doit_changer_mdp: false }).eq('id', uid);
  if (dbError) throw dbError;
}

// Admin-only : crée un compte Auth + sa fiche public.users, via l'Edge Function `main` (clé
// service_role, jamais côté navigateur). Même contrat que createUserAccount de firebase/auth.js :
// prend (email, password, userData) et renvoie { uid, ...userData, email }.
export async function createUserAccount(email, password, userData) {
  const data = await callAdminFunction('createUserAccount', { email, password, ...userData });
  return { uid: data.uid, ...userData, email };
}

// Admin-only : réinitialise le mot de passe d'un AUTRE utilisateur (repose doit_changer_mdp côté
// serveur, dans l'Edge Function). Même contrat que changeUserPassword de firebase/auth.js.
export async function changeUserPassword(uid, newPassword) {
  await callAdminFunction('changeUserPassword', { uid, newPassword });
}

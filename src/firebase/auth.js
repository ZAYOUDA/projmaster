import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  getAuth,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeApp, getApps } from 'firebase/app';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';

// App secondaire pour créer des comptes sans déconnecter l'admin
function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === 'secondary');
  const app = existing || initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  }, 'secondary');
  return getAuth(app);
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  // Mise à jour derniere_connexion — non bloquant (peut échouer si règles restrictives)
  setDoc(
    doc(db, 'users', cred.user.uid),
    { derniere_connexion: serverTimestamp() },
    { merge: true }
  ).catch(() => {});
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export async function getUserDoc(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

// Admin-only : réinitialise le mot de passe d'un AUTRE utilisateur, via la Cloud Function.
// Repose le drapeau doit_changer_mdp : l'admin garde toujours la main pour réinitialiser, mais
// la personne concernée sera ensuite obligée de choisir son propre mot de passe à sa prochaine
// connexion (même mécanique qu'à la création de compte).
export async function changeUserPassword(uid, newPassword) {
  const functions = getFunctions(undefined, 'us-central1');
  const fn = httpsCallable(functions, 'changeUserPassword');
  await fn({ uid, newPassword });
  await setDoc(doc(db, 'users', uid), { doit_changer_mdp: true }, { merge: true }).catch(() => {});
}

// Self-service : l'utilisateur connecté change SON PROPRE mot de passe. Nécessite de ressaisir
// le mot de passe actuel (reauthentification) — condition de sécurité ET exigence technique
// Firebase (updatePassword échoue avec auth/requires-recent-login sur une session pas toute
// fraîche si on ne réauthentifie pas juste avant).
export async function changeMyPassword(currentPassword, newPassword) {
  const user = auth.currentUser;
  if (!user || !user.email) throw new Error('Aucun utilisateur connecté.');
  const credential = EmailAuthProvider.credential(user.email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  await updatePassword(user, newPassword);
  // Si le drapeau était encore posé (cas limite), on le lève aussi ici par cohérence.
  await setDoc(doc(db, 'users', user.uid), { doit_changer_mdp: false }, { merge: true }).catch(() => {});
}

// Première connexion / suite à une réinitialisation admin : la session vient d'être ouverte
// (login() tout juste appelé), donc pas de "requires-recent-login" — pas besoin de redemander
// le mot de passe actuel. Lève ensuite doit_changer_mdp pour ne plus reproposer l'écran bloquant.
export async function terminerPremiereConnexion(newPassword) {
  const user = auth.currentUser;
  if (!user) throw new Error('Aucun utilisateur connecté.');
  await updatePassword(user, newPassword);
  await setDoc(doc(db, 'users', user.uid), { doit_changer_mdp: false }, { merge: true });
}

export async function createUserAccount(email, password, userData) {
  const secondaryAuth = getSecondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
  await signOut(secondaryAuth);
  const uid = cred.user.uid;
  await setDoc(doc(db, 'users', uid), {
    uid,
    email,
    nom: userData.nom,
    prenom: userData.prenom,
    role: userData.role || 'collaborateur',
    collaborateur_id: userData.collaborateur_id || '',
    projets_autorises: userData.projets_autorises || [],
    actif: true,
    derniere_connexion: null,
    created_at: serverTimestamp(),
    // Force le choix d'un nouveau mot de passe à la première connexion (mot de passe initial
    // choisi par l'admin) — levé par terminerPremiereConnexion().
    doit_changer_mdp: true,
  });
  return { uid, ...userData, email };
}

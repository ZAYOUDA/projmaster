import {
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  getAuth,
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

export async function changeUserPassword(uid, newPassword) {
  const functions = getFunctions(undefined, 'us-central1');
  const fn = httpsCallable(functions, 'changeUserPassword');
  await fn({ uid, newPassword });
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
  });
  return { uid, ...userData, email };
}

import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  documentId,
} from 'firebase/firestore';
import { db } from './config';

// ── Collaborateurs ───────────────────────────────────────────────
export function subscribeCollaborateurs(callback) {
  return onSnapshot(collection(db, 'collaborateurs'), (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

export async function saveCollaborateur(id, data) {
  await setDoc(doc(db, 'collaborateurs', id), data);
}

export async function patchCollaborateur(id, updates) {
  await updateDoc(doc(db, 'collaborateurs', id), updates);
}

export async function removeCollaborateur(id) {
  await deleteDoc(doc(db, 'collaborateurs', id));
}

// ── Projets ──────────────────────────────────────────────────────
export function subscribeProjets(callback, projetIds = null) {
  // projetIds = null → admin, écoute tout
  // projetIds = [] → collab sans projet, retourne vide immédiatement
  // projetIds = ['id1','id2'] → collab, filtre sur ces IDs
  if (projetIds !== null && projetIds.length === 0) {
    callback([]);
    return () => {};
  }
  const q = projetIds
    ? query(collection(db, 'projets'), where(documentId(), 'in', projetIds))
    : collection(db, 'projets');
  return onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    callback(items);
  });
}

// Écoute le document utilisateur (pour détecter les changements de projets_autorises)
export function subscribeUserDoc(uid, callback) {
  return onSnapshot(doc(db, 'users', uid), (snap) => {
    if (snap.exists()) callback({ uid, ...snap.data() });
  });
}

export async function saveProjet(id, data) {
  await setDoc(doc(db, 'projets', id), data);
}

export async function patchProjet(id, updates) {
  await updateDoc(doc(db, 'projets', id), updates);
}

export async function removeProjet(id) {
  await deleteDoc(doc(db, 'projets', id));
}

// ── Users (admin) ─────────────────────────────────────────────────
export function subscribeUsers(callback) {
  return onSnapshot(collection(db, 'users'), (snap) => {
    const items = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    callback(items);
  });
}

export async function saveUser(uid, data) {
  await setDoc(doc(db, 'users', uid), data);
}

export async function patchUser(uid, updates) {
  await updateDoc(doc(db, 'users', uid), updates);
}

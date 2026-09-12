// Façade data layer : résout vers src/firebase/firestore.js ou src/supabase/firestore.js selon
// DATA_BACKEND (cf. src/config/dataBackend.js — LOCAL uniquement, jamais en prod). Les deux
// modules exposent la même API (mêmes noms de fonctions, mêmes signatures), donc useAppStore.js
// n'a besoin de connaître que cette façade, jamais les deux implémentations directement.
import { DATA_BACKEND } from './dataBackend';
import * as firebaseFirestore from '../firebase/firestore';
import * as supabaseFirestore from '../supabase/firestore';

const impl = DATA_BACKEND === 'supabase' ? supabaseFirestore : firebaseFirestore;

export const {
  subscribeCollaborateurs, saveCollaborateur, patchCollaborateur, removeCollaborateur,
  subscribeProjets, saveProjet, patchProjet, removeProjet,
  subscribeUsers, subscribeUserDoc, saveUser, patchUser,
  subscribeTaches, saveTache, patchTache, removeTache,
} = impl;

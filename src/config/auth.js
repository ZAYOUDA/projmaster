// Façade auth : résout vers src/firebase/auth.js ou src/supabase/auth.js selon DATA_BACKEND
// (cf. src/config/dataBackend.js — LOCAL uniquement, jamais en prod).
//
// createUserAccount / changeUserPassword (actions ADMIN sur un AUTRE compte) nécessitent une clé
// privilégiée (service_role côté Supabase) et passent par une Edge Function — pas encore écrite
// (cf. tâche séparée). En attendant, sur le backend Supabase ces deux stubs lèvent une erreur
// claire plutôt que d'échouer silencieusement ou de planter sur un import manquant.
import { DATA_BACKEND } from './dataBackend';
import * as firebaseAuth from '../firebase/auth';
import * as supabaseAuth from '../supabase/auth';

const impl = DATA_BACKEND === 'supabase' ? supabaseAuth : firebaseAuth;

function pasEncoreDisponible(nom) {
  return async () => {
    throw new Error(`${nom} : pas encore implémenté côté Supabase (Edge Function admin manquante).`);
  };
}

export const login = impl.login;
export const logout = impl.logout;
export const getUserDoc = impl.getUserDoc;
export const changeMyPassword = impl.changeMyPassword;
export const terminerPremiereConnexion = impl.terminerPremiereConnexion;
export const createUserAccount = impl.createUserAccount || pasEncoreDisponible('createUserAccount');
export const changeUserPassword = impl.changeUserPassword || pasEncoreDisponible('changeUserPassword');

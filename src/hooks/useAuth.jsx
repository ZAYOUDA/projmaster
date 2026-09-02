import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase/config';
import { getUserDoc } from '../firebase/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = chargement en cours
  const [userDoc, setUserDoc] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        let doc = null;
        try {
          doc = await getUserDoc(firebaseUser.uid);
        } catch (e) {
          // Ne jamais laisser user/userDoc bloqués sur leur valeur précédente (undefined) :
          // sinon ProtectedRoute reste sur "Chargement…" ou rebascule sur /login indéfiniment,
          // ce qui se manifeste comme "il faut se reconnecter deux fois".
          console.error('getUserDoc a échoué (règles Firestore non déployées ?)', e);
        }
        setUser(firebaseUser);
        setUserDoc(doc);
      } else {
        setUser(null);
        setUserDoc(null);
      }
    });
    return unsub;
  }, []);

  // userDoc n'est PAS un listener temps réel (juste un getDoc() ponctuel déclenché par
  // onAuthStateChanged) : un write Firestore ailleurs (ex. terminerPremiereConnexion qui lève
  // doit_changer_mdp) ne met donc pas ce state à jour tout seul — d'où l'écran de mot de passe
  // qui restait affiché tant qu'on ne rafraîchissait pas la page. Permet de le refaire à la main
  // juste après un tel write, sans reload complet.
  const refreshUserDoc = async () => {
    if (!auth.currentUser) return;
    const doc = await getUserDoc(auth.currentUser.uid);
    setUserDoc(doc);
  };

  return (
    <AuthContext.Provider value={{ user, userDoc, loading: user === undefined, refreshUserDoc }}>
      {children}
    </AuthContext.Provider>
  );
}

// Rôles : 'admin' | 'manager' | 'chef_projet' | 'collaborateur'.
// hasFullAccess (admin/manager) = tous les projets, sans passer par projets_autorises.
// canAccessProjet = lecture (au minimum) sur ce projet précis.
// canManageProjet = écriture complète sur ce projet précis (WBS, budget, facturation, RIAD…).
//
// Rôle par projet : `role` reste le rôle global/par défaut de la personne (utilisé par ex. pour
// "Mes actions" ou la création de projet, qui ne sont pas liées à un projet précis). Mais un
// même profil peut être collaborateur sur un projet et chef de projet sur un autre — la
// surcharge vit dans `userDoc.projets_roles = { [projetId]: 'chef_projet' | 'collaborateur' }`.
// Absence d'entrée pour un projet = on retombe sur le rôle global (rétrocompatible : aucune
// migration nécessaire, personne ne perd d'accès tant que projets_roles n'est pas renseigné).
export function useAuth() {
  const ctx = useContext(AuthContext);
  const role = ctx?.userDoc?.role;
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isChefProjet = role === 'chef_projet';
  const isCollab = role === 'collaborateur';
  const hasFullAccess = isAdmin || isManager;
  const canManageUsers = isAdmin || isManager;
  const projetsAutorises = ctx?.userDoc?.projets_autorises || [];
  const projetsRoles = ctx?.userDoc?.projets_roles || {};

  const roleSurProjet = (projetId) => projetsRoles[projetId] || role;
  const isChefProjetSur = (projetId) => roleSurProjet(projetId) === 'chef_projet';
  const isCollabSur = (projetId) => roleSurProjet(projetId) === 'collaborateur';

  const canAccessProjet = (projetId) => hasFullAccess || projetsAutorises.includes(projetId);
  const canManageProjet = (projetId) => hasFullAccess || (isChefProjetSur(projetId) && canAccessProjet(projetId));
  // Première connexion (mot de passe initial posé par l'admin) ou réinitialisation admin :
  // l'utilisateur doit choisir son propre mot de passe avant d'accéder à l'app (cf. App.jsx).
  const doitChangerMdp = !!ctx?.userDoc?.doit_changer_mdp;

  return {
    ...ctx,
    role, isAdmin, isManager, isChefProjet, isCollab,
    hasFullAccess, canManageUsers, canAccessProjet, canManageProjet,
    projetsRoles, roleSurProjet, isChefProjetSur, isCollabSur, doitChangerMdp,
  };
}

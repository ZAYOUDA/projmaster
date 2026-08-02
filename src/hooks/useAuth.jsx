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

  return (
    <AuthContext.Provider value={{ user, userDoc, loading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  );
}

// Rôles : 'admin' | 'manager' | 'chef_projet' | 'collaborateur'.
// hasFullAccess (admin/manager) = tous les projets, sans passer par projets_autorises.
// canAccessProjet = lecture (au minimum) sur ce projet précis.
// canManageProjet = écriture complète sur ce projet précis (WBS, budget, facturation, RIAD…).
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

  const canAccessProjet = (projetId) => hasFullAccess || projetsAutorises.includes(projetId);
  const canManageProjet = (projetId) => hasFullAccess || (isChefProjet && canAccessProjet(projetId));

  return {
    ...ctx,
    role, isAdmin, isManager, isChefProjet, isCollab,
    hasFullAccess, canManageUsers, canAccessProjet, canManageProjet,
  };
}

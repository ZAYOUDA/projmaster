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

export function useAuth() {
  return useContext(AuthContext);
}

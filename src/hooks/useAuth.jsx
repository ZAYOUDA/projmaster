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
        const doc = await getUserDoc(firebaseUser.uid);
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

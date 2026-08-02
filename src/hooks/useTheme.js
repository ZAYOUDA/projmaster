import { useState, useEffect, useCallback } from 'react';

// Préférence clair/sombre — indépendante du store Firestore (useAppStore) car c'est un réglage
// purement local à l'appareil, pas une donnée métier à synchroniser. Persisté dans localStorage,
// appliqué via l'attribut data-theme sur <html> pour que les variables CSS (voir index.css)
// basculent globalement sans avoir à passer le thème en prop à chaque composant.
const STORAGE_KEY = 'projmaster_theme';

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light';
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'dark' ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggleTheme };
}

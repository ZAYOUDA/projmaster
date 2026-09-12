import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

// Onglets projet accessibles à un profil Client (cf. ProjetLayout.jsx ALL_TABS) — tout le reste
// (vue d'ensemble, autres projets, outils d'administration) est hors de portée par construction :
// un Client est redirigé vers le seul de ces onglets sur son seul projet autorisé dès qu'il essaie
// d'aller ailleurs (y compris en tapant une URL directement).
const CLIENT_ALLOWED_TABS = ['planning', 'kanban', 'risques', 'resume'];

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, hasFullAccess, isClient, projetsAutorises } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F8F7' }}>
        <span style={{ color: '#888', fontSize: 14 }}>Chargement…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (adminOnly && !hasFullAccess) return <Navigate to="/" replace />;

  if (isClient) {
    const projetId = projetsAutorises[0];
    const cible = projetId ? `/projet/${projetId}/planning` : '/login';
    const surSonOnglet = projetId && CLIENT_ALLOWED_TABS.some((t) => location.pathname === `/projet/${projetId}/${t}`);
    if (!surSonOnglet) return <Navigate to={cible} replace />;
  }

  return children;
}

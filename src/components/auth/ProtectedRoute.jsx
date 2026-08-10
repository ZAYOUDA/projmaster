import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, hasFullAccess } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8F8F7' }}>
        <span style={{ color: '#888', fontSize: 14 }}>Chargement…</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (adminOnly && !hasFullAccess) return <Navigate to="/" replace />;

  return children;
}

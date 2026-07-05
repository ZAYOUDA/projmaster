import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export default function AdminRoute({ children }) {
  const { user, userDoc, loading } = useAuth();
  if (loading || user === undefined) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#FAFAF9' }}>
        <div style={{ width: 24, height: 24, border: '2px solid #E8E7E3', borderTopColor: '#1A1A18', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
      </div>
    );
  }
  if (!user || userDoc?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

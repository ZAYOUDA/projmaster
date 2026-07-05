import { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './components/layout/Sidebar';
import useAppStore from './store/useAppStore';
import { useAuth } from './hooks/useAuth';
import './index.css';

export default function App() {
  const init = useAppStore((s) => s.init);
  const destroy = useAppStore((s) => s.destroy);
  const savedAt = useAppStore((s) => s.savedAt);
  const [showSaved, setShowSaved] = useState(false);
  const { user, userDoc } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && userDoc) {
      init(userDoc);
    } else if (user === null) {
      destroy();
      navigate('/login', { replace: true });
    }
    return () => { if (user) destroy(); };
  }, [user, userDoc]);

  useEffect(() => {
    if (!savedAt) return;
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 2000);
    return () => clearTimeout(t);
  }, [savedAt]);

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#FFFFFF' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
        <Outlet />
      </main>
      {showSaved && (
        <div style={{
          position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
          background: '#1A1A18', color: '#fff', borderRadius: 8, padding: '6px 14px',
          fontSize: 12, fontWeight: 500, boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
        }}>
          ✓ Sauvegardé
        </div>
      )}
    </div>
  );
}

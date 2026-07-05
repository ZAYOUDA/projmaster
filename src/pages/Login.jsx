import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../firebase/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch {
      setError('Email ou mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#F8F8F7',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '40px 36px', width: 360,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #EBEBEA',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 12, background: '#378ADD', marginBottom: 12,
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="7" height="7" rx="1.5" fill="white" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" fill="white" opacity="0.7" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" fill="white" opacity="0.7" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" fill="white" opacity="0.4" />
            </svg>
          </div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1A1A18', letterSpacing: '-0.3px' }}>
            ProjMaster
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#888780' }}>Connectez-vous pour continuer</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1A1A18', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="vous@exemple.com"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 12px',
                border: '1px solid #DEDEDC', borderRadius: 8, fontSize: 14, outline: 'none',
                color: '#1A1A18', background: '#FAFAF9',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1A1A18', marginBottom: 6 }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 12px',
                border: '1px solid #DEDEDC', borderRadius: 8, fontSize: 14, outline: 'none',
                color: '#1A1A18', background: '#FAFAF9',
              }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 16, padding: '9px 12px', background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: 8, fontSize: 13, color: '#DC2626',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '10px 0', background: loading ? '#9DBFE8' : '#378ADD',
              color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
            }}
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#888780' }}>
          Les comptes sont créés par l'administrateur.
        </p>
      </div>
    </div>
  );
}

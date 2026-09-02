import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { terminerPremiereConnexion, logout } from '../../firebase/auth';
import { useAuth } from '../../hooks/useAuth';

// Écran bloquant affiché quand userDoc.doit_changer_mdp === true (première connexion avec le
// mot de passe créé par l'admin, ou après une réinitialisation admin) : l'utilisateur ne peut
// pas accéder au reste de l'app tant qu'il n'a pas choisi son propre mot de passe. Pas de champ
// "mot de passe actuel" : la session vient d'être ouverte (login() tout juste appelé), donc
// updatePassword() n'a pas besoin de réauthentification (cf. terminerPremiereConnexion).
export default function ForcePasswordChange() {
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { refreshUserDoc } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPwd.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPwd !== confirmPwd) {
      setError('La confirmation ne correspond pas au nouveau mot de passe.');
      return;
    }
    setLoading(true);
    try {
      await terminerPremiereConnexion(newPwd);
      // userDoc n'est pas un listener temps réel (simple getDoc() ponctuel dans useAuth.jsx) :
      // sans ce refresh manuel, doit_changer_mdp restait à true côté client tant qu'on ne
      // rechargeait pas la page, alors même que Firestore avait déjà le champ à false.
      await refreshUserDoc();
      // Pas de setLoading(false) : App.jsx affiche alors l'app normalement dès que
      // userDoc.doit_changer_mdp passe à false — ce composant sera démonté.
    } catch (err) {
      const text =
        err.code === 'auth/weak-password'
          ? 'Le nouveau mot de passe est trop faible (6 caractères minimum).'
          : err.code === 'auth/requires-recent-login'
          ? 'Session trop ancienne — reconnectez-vous puis réessayez.'
          : 'Une erreur est survenue. Réessayez.';
      setError(text);
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F8F7' }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '40px 36px', width: 380,
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid #EBEBEA',
      }}>
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 48, height: 48, borderRadius: 12, background: '#378ADD', marginBottom: 12,
          }}>
            <KeyRound size={22} color="#fff" />
          </div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1A1A18', letterSpacing: '-0.3px' }}>
            Choisissez votre mot de passe
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#888780' }}>
            Pour votre sécurité, remplacez le mot de passe créé pour vous avant de continuer.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1A1A18', marginBottom: 6 }}>
              Nouveau mot de passe
            </label>
            <input
              type="password"
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              required
              autoFocus
              placeholder="••••••••"
              style={{
                width: '100%', boxSizing: 'border-box', padding: '9px 12px',
                border: '1px solid #DEDEDC', borderRadius: 8, fontSize: 14, outline: 'none',
                color: '#1A1A18', background: '#FAFAF9',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#1A1A18', marginBottom: 6 }}>
              Confirmer le nouveau mot de passe
            </label>
            <input
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
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
            {loading ? 'Mise à jour…' : 'Valider et continuer'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => logout()}
          style={{
            display: 'block', margin: '16px auto 0', background: 'none', border: 'none',
            fontSize: 12, color: '#888780', cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

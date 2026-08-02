import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, Plus, FolderOpen, CalendarOff, LogOut, ShieldCheck, UploadCloud, Sun, Moon, Receipt } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import { useAuth } from '../../hooks/useAuth';
import { logout } from '../../firebase/auth';
import { useTheme } from '../../hooks/useTheme';
import NouveauProjetModal from './NouveauProjetModal';

const STATUT_COLORS = { actif: '#1D9E75', en_pause: '#BA7517', cloture: '#888780' };
const ROLE_BADGE = {
  admin:         { label: 'Admin',          bg: 'var(--color-info-soft)',    color: 'var(--color-info)' },
  manager:       { label: 'Manager',        bg: 'var(--color-accent-soft)',  color: 'var(--color-accent)' },
  chef_projet:   { label: 'Chef de Projet', bg: 'var(--color-warning-soft)', color: 'var(--color-warning)' },
  collaborateur: { label: 'Collaborateur',  bg: 'var(--color-bg-tertiary)',  color: 'var(--color-text-secondary)' },
};
// Onglet par défaut à l'ouverture d'un projet — les projets RUN n'ont pas de WBS.
const defaultTab = (p) => (p.type === 'RUN' ? 'suivi-mensuel' : 'wbs');
// toISOString() convertit en UTC : pour un Date à minuit local (fuseau UTC+, ex. France), ça
// retombe sur la veille. On formate donc à partir des composants locaux du Date.
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Sidebar() {
  const projets = useAppStore((s) => s.projets);
  const addProjet = useAppStore((s) => s.addProjet);
  const navigate = useNavigate();
  const { userDoc, hasFullAccess, isChefProjet } = useAuth();
  // Chef de Projet peut créer des projets (ils s'ajoutent automatiquement à son périmètre),
  // mais reste sans accès à la Console Admin / Import CRA — voir plus bas.
  const canCreateProjet = hasFullAccess || isChefProjet;
  const [showNewProjet, setShowNewProjet] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleCreateProjet = async (type) => {
    const newP = await addProjet({
      nom: 'Nouveau projet',
      description: '',
      type,
      date_debut: localIso(new Date()),
      date_fin_prevue: '',
    });
    setShowNewProjet(false);
    if (newP?.id) navigate(`/projet/${newP.id}/parametres`);
  };

  const handleImportPlanning = async () => {
    const newP = await addProjet({
      nom: 'Nouveau projet (import en cours)',
      description: '',
      type: 'BUILD',
      date_debut: localIso(new Date()),
      date_fin_prevue: '',
    });
    setShowNewProjet(false);
    if (newP?.id) navigate(`/projet/${newP.id}/import-wbs?fromCreation=1`);
  };

  const handleLogout = async () => {
    await logout();
  };

  const linkStyle = ({ isActive }) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', borderRadius: 6, textDecoration: 'none',
    fontSize: 13, fontWeight: 500,
    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    background: isActive ? 'var(--color-bg-tertiary)' : 'transparent',
    transition: 'background 0.15s',
  });

  return (
    <aside style={{
      width: 200, flexShrink: 0, background: 'var(--color-bg-sidebar)',
      borderRight: '0.5px solid var(--color-border)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0, overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '0.5px solid var(--color-border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOpen size={18} color="var(--color-accent)" />
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>MisterProject</span>
        </div>
        <div style={{
          marginTop: 8,
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600,
          background: import.meta.env.DEV ? '#FFF3CD' : '#D1FAE5',
          color: import.meta.env.DEV ? '#92400E' : '#065F46',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: import.meta.env.DEV ? '#D97706' : '#059669',
            flexShrink: 0,
          }} />
          {import.meta.env.DEV ? 'DEV' : 'PROD'}
        </div>
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {/* Dashboard */}
        <NavLink to="/" end style={linkStyle}>
          <LayoutDashboard size={15} />
          Vue d'ensemble
        </NavLink>

        {/* Projets */}
        <div style={{ margin: '16px 4px 6px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Projets
        </div>

        {projets.filter((p) => p.statut !== 'cloture').map((p) => (
          <NavLink key={p.id} to={`/projet/${p.id}/${defaultTab(p)}`} style={linkStyle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
          </NavLink>
        ))}

        {projets.filter((p) => p.statut === 'cloture').length > 0 && (
          <>
            {projets.filter((p) => p.statut === 'cloture').map((p) => (
              <NavLink key={p.id} to={`/projet/${p.id}/${defaultTab(p)}`} style={({ isActive }) => ({ ...linkStyle({ isActive }), opacity: 0.5 })}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
              </NavLink>
            ))}
          </>
        )}

        {canCreateProjet && <button
          onClick={() => setShowNewProjet(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 12px', borderRadius: 6, border: 'none',
            background: 'transparent', cursor: 'pointer', fontSize: 13,
            color: 'var(--color-text-tertiary)', fontWeight: 500, marginTop: 4,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <Plus size={14} />
          Nouveau projet
        </button>}

        {/* Outils */}
        <div style={{ margin: '16px 4px 6px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Outils
        </div>
        {hasFullAccess && (
          <NavLink to="/admin" style={linkStyle}>
            <ShieldCheck size={15} />
            Console Admin
          </NavLink>
        )}
        {hasFullAccess && (
          <NavLink to="/import-cra" style={linkStyle}>
            <UploadCloud size={15} />
            Import CRA
          </NavLink>
        )}
        {hasFullAccess && (
          <NavLink to="/facturation-portefeuille" style={linkStyle}>
            <Receipt size={15} />
            Facturation
          </NavLink>
        )}
        <NavLink to="/collaborateurs" style={linkStyle}>
          <Users size={15} />
          Collaborateurs
        </NavLink>
        <NavLink to="/conges" style={linkStyle}>
          <CalendarOff size={15} />
          Congés équipe
        </NavLink>
        <NavLink to="/parametres" style={linkStyle}>
          <Settings size={15} />
          Paramètres
        </NavLink>
      </nav>

      {/* Déconnexion */}
      <div style={{ padding: '8px 8px 16px', borderTop: '0.5px solid var(--color-border-soft)' }}>
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Passer en thème sombre' : 'Passer en thème clair'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 12px', borderRadius: 6, border: 'none',
            background: 'transparent', cursor: 'pointer', fontSize: 13,
            color: 'var(--color-text-tertiary)', fontWeight: 500,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          {theme === 'light' ? 'Thème sombre' : 'Thème clair'}
        </button>
        {userDoc && (
          <div style={{ padding: '4px 12px 8px' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 2 }}>
              {userDoc.prenom} {userDoc.nom}
            </div>
            <span style={{
              display: 'inline-block', padding: '1px 7px', borderRadius: 99, fontSize: 10, fontWeight: 600,
              background: ROLE_BADGE[userDoc.role]?.bg || 'var(--color-bg-tertiary)',
              color: ROLE_BADGE[userDoc.role]?.color || 'var(--color-text-secondary)',
            }}>
              {ROLE_BADGE[userDoc.role]?.label || userDoc.role}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 12px', borderRadius: 6, border: 'none',
            background: 'transparent', cursor: 'pointer', fontSize: 13,
            color: 'var(--color-text-tertiary)', fontWeight: 500,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-danger-soft)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut size={14} />
          Déconnexion
        </button>
      </div>

      {showNewProjet && (
        <NouveauProjetModal
          onCreate={handleCreateProjet}
          // Import depuis fichier → /projet/:id/import-wbs, une route réservée à AdminRoute
          // (hasFullAccess) : un Chef de Projet qui l'emprunterait créerait le projet puis se
          // ferait rediriger vers "/" sans pouvoir importer. On masque donc ce chemin pour lui.
          onImportPlanning={hasFullAccess ? handleImportPlanning : undefined}
          onClose={() => setShowNewProjet(false)}
        />
      )}
    </aside>
  );
}

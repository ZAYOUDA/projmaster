import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, Plus, FolderOpen, CalendarOff, LogOut, ShieldCheck, UploadCloud, Sun, Moon, Receipt, ChevronsLeft, ChevronsRight } from 'lucide-react';
import useAppStore from '../../store/useAppStore';
import { useAuth } from '../../hooks/useAuth';
import { logout } from '../../config/auth';
import { useTheme } from '../../hooks/useTheme';
import NouveauProjetModal from './NouveauProjetModal';
import { APP_VERSION } from '../../config/version';

const STATUT_COLORS = { actif: '#1D9E75', en_pause: '#BA7517', cloture: '#888780' };
const ROLE_BADGE = {
  admin:         { label: 'Admin',          bg: 'var(--color-info-soft)',    color: 'var(--color-info)' },
  manager:       { label: 'Manager',        bg: 'var(--color-accent-soft)',  color: 'var(--color-accent)' },
  chef_projet:   { label: 'Chef de Projet', bg: 'var(--color-warning-soft)', color: 'var(--color-warning)' },
  collaborateur: { label: 'Collaborateur',  bg: 'var(--color-bg-tertiary)',  color: 'var(--color-text-secondary)' },
  client:        { label: 'Client',         bg: 'var(--color-bg-tertiary)',  color: 'var(--color-text-secondary)' },
};
// Onglet par défaut à l'ouverture d'un projet — les projets RUN n'ont pas de WBS/Sanity Check.
// Sanity Check n'est pas dans les onglets d'un Collaborateur (cf. ProjetLayout.jsx) : on
// l'envoie directement sur WBS pour ne pas le faire atterrir sur une page sans onglet actif
// dans sa propre navigation (rôle PAR PROJET — isCollabSur, pas le rôle global).
const defaultTab = (p, isCollabSur) =>
  p.type === 'RUN' ? 'suivi-mensuel' : (isCollabSur(p.id) ? 'wbs' : 'sanity');
// toISOString() convertit en UTC : pour un Date à minuit local (fuseau UTC+, ex. France), ça
// retombe sur la veille. On formate donc à partir des composants locaux du Date.
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Sidebar() {
  const projets = useAppStore((s) => s.projets);
  const addProjet = useAppStore((s) => s.addProjet);
  const navigate = useNavigate();
  const { userDoc, hasFullAccess, isChefProjet, isCollabSur, isClient } = useAuth();
  // Chef de Projet peut créer des projets (ils s'ajoutent automatiquement à son périmètre),
  // mais reste sans accès à la Console Admin / Import CRA — voir plus bas.
  const canCreateProjet = hasFullAccess || isChefProjet;
  const [showNewProjet, setShowNewProjet] = useState(false);
  const { theme, toggleTheme } = useTheme();

  // Sidebar repliable en rail d'icônes — préférence purement visuelle, persistée en local
  // (pas de sens à la synchroniser via Firestore) pour rester repliée d'une session à l'autre.
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('pm_sidebar_collapsed') === '1');
  useEffect(() => {
    localStorage.setItem('pm_sidebar_collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

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
    justifyContent: collapsed ? 'center' : 'flex-start',
    padding: collapsed ? '8px 0' : '6px 12px', borderRadius: 6, textDecoration: 'none',
    fontSize: 13, fontWeight: 500,
    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    background: isActive ? 'var(--color-bg-tertiary)' : 'transparent',
    transition: 'background 0.15s',
  });
  // Bouton "outil" (thème, déconnexion, nouveau projet) — même logique de repli que linkStyle.
  const toolBtnStyle = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    justifyContent: collapsed ? 'center' : 'flex-start',
    padding: collapsed ? '8px 0' : '6px 12px', borderRadius: 6, border: 'none',
    background: 'transparent', cursor: 'pointer', fontSize: 13,
    color: 'var(--color-text-tertiary)', fontWeight: 500,
  };
  const sectionLabelStyle = { margin: '16px 4px 6px', fontSize: 11, fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em' };

  return (
    <aside style={{
      width: collapsed ? 56 : 200, flexShrink: 0, background: 'var(--color-bg-sidebar)',
      borderRight: '0.5px solid var(--color-border)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0, overflow: 'hidden',
      transition: 'width 0.15s ease',
    }}>
      {/* Logo + repli */}
      <div style={{ padding: collapsed ? '16px 8px' : '20px 16px 16px', borderBottom: '0.5px solid var(--color-border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <FolderOpen size={18} color="var(--color-accent)" style={{ flexShrink: 0 }} />
            {!collapsed && <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>MisterProject</span>}
          </div>
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              title="Replier le panneau"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'flex', padding: 2, flexShrink: 0 }}
            >
              <ChevronsLeft size={15} />
            </button>
          )}
        </div>
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            title="Déplier le panneau"
            style={{ display: 'flex', margin: '10px auto 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', padding: 2 }}
          >
            <ChevronsRight size={15} />
          </button>
        ) : (
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
        )}
      </div>

      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px' }}>
        {/* Dashboard — jamais pour un Client (profil externe : pas de vue d'ensemble multi-projets,
            directement redirigé vers son seul projet, cf. ProtectedRoute.jsx). */}
        {!isClient && (
          <NavLink to="/" end style={linkStyle} title="Vue d'ensemble">
            <LayoutDashboard size={15} />
            {!collapsed && "Vue d'ensemble"}
          </NavLink>
        )}

        {/* Projets */}
        {!collapsed && <div style={sectionLabelStyle}>Projets</div>}

        {projets.filter((p) => p.statut !== 'cloture').map((p) => (
          <NavLink key={p.id} to={`/projet/${p.id}/${defaultTab(p, isCollabSur)}`} style={linkStyle} title={p.nom}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
            {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>}
          </NavLink>
        ))}

        {projets.filter((p) => p.statut === 'cloture').length > 0 && (
          <>
            {projets.filter((p) => p.statut === 'cloture').map((p) => (
              <NavLink key={p.id} to={`/projet/${p.id}/${defaultTab(p, isCollabSur)}`} style={({ isActive }) => ({ ...linkStyle({ isActive }), opacity: 0.5 })} title={p.nom}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
                {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>}
              </NavLink>
            ))}
          </>
        )}

        {canCreateProjet && <button
          onClick={() => setShowNewProjet(true)}
          title="Nouveau projet"
          style={{ ...toolBtnStyle, marginTop: 4 }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <Plus size={14} />
          {!collapsed && 'Nouveau projet'}
        </button>}

        {/* Outils — aucun pour un Client (profil externe, pas d'accès aux outils d'administration). */}
        {!isClient && (
          <>
            {!collapsed && <div style={sectionLabelStyle}>Outils</div>}
            {hasFullAccess && (
              <NavLink to="/admin" style={linkStyle} title="Console Admin">
                <ShieldCheck size={15} />
                {!collapsed && 'Console Admin'}
              </NavLink>
            )}
            {hasFullAccess && (
              <NavLink to="/import-cra" style={linkStyle} title="Import CRA">
                <UploadCloud size={15} />
                {!collapsed && 'Import CRA'}
              </NavLink>
            )}
            {hasFullAccess && (
              <NavLink to="/facturation-portefeuille" style={linkStyle} title="Facturation">
                <Receipt size={15} />
                {!collapsed && 'Facturation'}
              </NavLink>
            )}
            <NavLink to="/collaborateurs" style={linkStyle} title="Collaborateurs">
              <Users size={15} />
              {!collapsed && 'Collaborateurs'}
            </NavLink>
            <NavLink to="/conges" style={linkStyle} title="Congés équipe">
              <CalendarOff size={15} />
              {!collapsed && 'Congés équipe'}
            </NavLink>
            <NavLink to="/parametres" style={linkStyle} title="Paramètres">
              <Settings size={15} />
              {!collapsed && 'Paramètres'}
            </NavLink>
          </>
        )}
      </nav>

      {/* Déconnexion */}
      <div style={{ padding: collapsed ? '8px 4px 12px' : '8px 8px 16px', borderTop: '0.5px solid var(--color-border-soft)' }}>
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Passer en thème sombre' : 'Passer en thème clair'}
          style={toolBtnStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          {theme === 'light' ? <Moon size={14} /> : <Sun size={14} />}
          {!collapsed && (theme === 'light' ? 'Thème sombre' : 'Thème clair')}
        </button>
        {userDoc && !collapsed && (
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
        {userDoc && collapsed && (
          <div title={`${userDoc.prenom} ${userDoc.nom} — ${ROLE_BADGE[userDoc.role]?.label || userDoc.role}`} style={{ display: 'flex', justifyContent: 'center', padding: '6px 0' }}>
            <span style={{
              width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700,
              background: ROLE_BADGE[userDoc.role]?.bg || 'var(--color-bg-tertiary)',
              color: ROLE_BADGE[userDoc.role]?.color || 'var(--color-text-secondary)',
            }}>
              {(userDoc.prenom?.[0] || '') + (userDoc.nom?.[0] || '')}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          title="Déconnexion"
          style={toolBtnStyle}
          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-danger-soft)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <LogOut size={14} />
          {!collapsed && 'Déconnexion'}
        </button>
        {!collapsed && (
          <p style={{ margin: '10px 4px 0', fontSize: 10, color: 'var(--color-text-tertiary)', textAlign: 'center' }}>
            © By MZBH {new Date().getFullYear()} · {APP_VERSION}
          </p>
        )}
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

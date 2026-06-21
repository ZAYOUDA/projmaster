import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Settings, Plus, FolderOpen, CalendarOff } from 'lucide-react';
import useAppStore from '../../store/useAppStore';

const STATUT_COLORS = { actif: '#1D9E75', en_pause: '#BA7517', cloture: '#888780' };

export default function Sidebar() {
  const projets = useAppStore((s) => s.projets);
  const addProjet = useAppStore((s) => s.addProjet);
  const navigate = useNavigate();

  const handleNewProjet = () => {
    const p = addProjet({
      nom: 'Nouveau projet',
      description: '',
      date_debut: new Date().toISOString().slice(0, 10),
      date_fin_prevue: '',
    });
    navigate(`/projet/${p.id}/parametres`);
  };

  const linkStyle = ({ isActive }) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', borderRadius: 6, textDecoration: 'none',
    fontSize: 13, fontWeight: 500,
    color: isActive ? '#1A1A18' : '#5F5E5A',
    background: isActive ? '#F1EFE8' : 'transparent',
    transition: 'background 0.15s',
  });

  return (
    <aside style={{
      width: 200, flexShrink: 0, background: '#F8F8F7',
      borderRight: '0.5px solid rgba(0,0,0,0.12)',
      display: 'flex', flexDirection: 'column',
      height: '100vh', position: 'sticky', top: 0, overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FolderOpen size={18} color="#378ADD" />
          <span style={{ fontSize: 15, fontWeight: 600, color: '#1A1A18' }}>ProjMaster</span>
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
        <div style={{ margin: '16px 4px 6px', fontSize: 11, fontWeight: 500, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Projets
        </div>

        {projets.filter((p) => p.statut !== 'cloture').map((p) => (
          <NavLink key={p.id} to={`/projet/${p.id}/wbs`} style={linkStyle}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
          </NavLink>
        ))}

        {projets.filter((p) => p.statut === 'cloture').length > 0 && (
          <>
            {projets.filter((p) => p.statut === 'cloture').map((p) => (
              <NavLink key={p.id} to={`/projet/${p.id}/wbs`} style={({ isActive }) => ({ ...linkStyle({ isActive }), opacity: 0.5 })}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.couleur, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nom}</span>
              </NavLink>
            ))}
          </>
        )}

        <button
          onClick={handleNewProjet}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '6px 12px', borderRadius: 6, border: 'none',
            background: 'transparent', cursor: 'pointer', fontSize: 13,
            color: '#888780', fontWeight: 500, marginTop: 4,
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#F1EFE8'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
        >
          <Plus size={14} />
          Nouveau projet
        </button>

        {/* Outils */}
        <div style={{ margin: '16px 4px 6px', fontSize: 11, fontWeight: 500, color: '#888780', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Outils
        </div>
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
    </aside>
  );
}

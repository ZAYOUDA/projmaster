import { NavLink, Outlet, useParams, Navigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { useAuth } from '../hooks/useAuth';
import { GitBranch, BarChart2, DollarSign, Columns, AlertTriangle, Settings, CalendarDays, Users, Receipt } from 'lucide-react';

const ALL_TABS = [
  { path: 'wbs',          label: 'WBS',              icon: GitBranch,    roles: ['admin', 'collaborateur'] },
  { path: 'planning',     label: 'Planning',         icon: CalendarDays, roles: ['admin', 'collaborateur'] },
  { path: 'gantt',        label: 'Gantt',            icon: BarChart2,    roles: ['admin', 'collaborateur'] },
  { path: 'budget',       label: 'Budget',           icon: DollarSign,   roles: ['admin'] },
  { path: 'kanban',       label: 'Kanban',           icon: Columns,      roles: ['admin', 'collaborateur'] },
  { path: 'risques',      label: 'Risques',          icon: AlertTriangle,roles: ['admin'] },
  { path: 'stakeholders', label: 'Parties prenantes',icon: Users,        roles: ['admin'] },
  { path: 'facturation',  label: 'Facturation',      icon: Receipt,      roles: ['admin'] },
  { path: 'parametres',   label: 'Paramètres',       icon: Settings,     roles: ['admin'] },
];

export default function ProjetLayout() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const { userDoc } = useAuth();

  if (!projet) return <Navigate to="/" replace />;

  const role = userDoc?.role || 'collaborateur';
  const tabs = ALL_TABS.filter((t) => t.roles.includes(role));

  const tabLink = ({ isActive }) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', textDecoration: 'none', fontSize: 13, fontWeight: 500,
    color: isActive ? '#1A1A18' : '#5F5E5A',
    borderBottom: isActive ? `2px solid ${projet.couleur}` : '2px solid transparent',
    transition: 'color 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div style={{ padding: '20px 32px 0', borderBottom: '0.5px solid rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: projet.couleur }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1A1A18' }}>{projet.nom}</h2>
          {projet.statut !== 'actif' && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: '#F1EFE8', color: '#888780', fontWeight: 500 }}>
              {projet.statut === 'en_pause' ? 'En pause' : 'Clôturé'}
            </span>
          )}
        </div>
        <nav style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {tabs.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={`/projet/${id}/${path}`} style={tabLink}>
              <Icon size={13} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        <Outlet />
      </div>
    </div>
  );
}

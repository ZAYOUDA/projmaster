import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useParams, Navigate } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import { useAuth } from '../hooks/useAuth';
import { calculerEVMProjet, calculerEarnedSchedule, detecterAvancementNonAJour } from '../utils/evmCalculs';
import SanteProjetEVM from '../components/projet/SanteProjetEVM';
import { GitBranch, BarChart2, DollarSign, Columns, AlertTriangle, Settings, CalendarDays, Users, Receipt, TrendingUp, FileSpreadsheet, ClipboardCheck } from 'lucide-react';

// Rôles avec édition complète sur un projet (WBS/Planning/Gantt/Kanban) : tous sauf Collaborateur,
// qui garde son accès actuel (assignation, mise à jour de son propre avancement).
const ROLES_GESTION = ['admin', 'manager', 'chef_projet'];

const ALL_TABS = [
  // Sanity Check : réservé à la gestion (admin/manager/chef de projet) — le Collaborateur ne
  // voit que WBS/Planning/Gantt/Kanban sur un projet.
  { path: 'sanity',        label: 'Sanity Check',     icon: ClipboardCheck, roles: ROLES_GESTION,                       types: ['BUILD'] },
  { path: 'wbs',           label: 'WBS',              icon: GitBranch,    roles: [...ROLES_GESTION, 'collaborateur'], types: ['BUILD'] },
  // Client (profil externe, lecture seule) : Planning, Kanban, RIAD, Résumé uniquement — jamais
  // WBS/Gantt/Budget/Facturation/Parties prenantes/Paramètres.
  { path: 'planning',      label: 'Planning',         icon: CalendarDays, roles: [...ROLES_GESTION, 'collaborateur', 'client'], types: ['BUILD'] },
  { path: 'gantt',         label: 'Gantt',            icon: BarChart2,    roles: [...ROLES_GESTION, 'collaborateur'], types: ['BUILD'] },
  { path: 'budget',        label: 'Budget',           icon: DollarSign,   roles: ROLES_GESTION,                       types: ['BUILD'] },
  { path: 'kanban',        label: 'Kanban',           icon: Columns,      roles: [...ROLES_GESTION, 'collaborateur', 'client'], types: ['BUILD'] },
  { path: 'suivi-mensuel', label: 'Suivi mensuel',    icon: TrendingUp,   roles: ROLES_GESTION,                       types: ['RUN'] },
  { path: 'risques',       label: 'RIAD',             icon: AlertTriangle,roles: [...ROLES_GESTION, 'client'],        types: ['BUILD', 'RUN'] },
  { path: 'stakeholders',  label: 'Parties prenantes',icon: Users,        roles: ROLES_GESTION,                       types: ['BUILD', 'RUN'] },
  { path: 'facturation',   label: 'Facturation',      icon: Receipt,      roles: ROLES_GESTION,                       types: ['BUILD', 'RUN'] },
  // Vue de synthèse pensée pour être exportée/partagée avec le client — juste avant Paramètres.
  { path: 'resume',        label: 'Résumé',           icon: FileSpreadsheet, roles: [...ROLES_GESTION, 'client'],     types: ['BUILD'] },
  { path: 'parametres',    label: 'Paramètres',       icon: Settings,     roles: ROLES_GESTION,                       types: ['BUILD', 'RUN'] },
];

export default function ProjetLayout() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const projetsLoaded = useAppStore((s) => s.projetsLoaded);
  const { roleSurProjet } = useAuth();
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);

  // Mesure la vraie hauteur du header (titre + onglets) pour que les pages enfants
  // (ex. RIAD) puissent coller leurs propres sous-onglets juste en dessous, sans deviner
  // une valeur en pixels qui se désynchroniserait au moindre changement de contenu.
  useEffect(() => {
    if (!headerRef.current) return;
    const el = headerRef.current;
    // offsetHeight (et non contentRect, qui exclut padding/bordure) = la vraie hauteur visuelle du bloc.
    const observer = new ResizeObserver(() => setHeaderHeight(el.offsetHeight));
    observer.observe(el);
    setHeaderHeight(el.offsetHeight);
    return () => observer.disconnect();
  }, []);

  // Ne redirige vers "/" que si les projets ont VRAIMENT fini de charger et que celui-ci est
  // absent — sinon, sur la toute première navigation (ex. Client redirigé directement vers son
  // projet par ProtectedRoute), l'abonnement Firestore n'a pas encore livré son premier snapshot :
  // `projet` est momentanément undefined, et rediriger tout de suite vers "/" fait rebondir vers
  // ProtectedRoute qui renvoie aussitôt ici → boucle infinie ("Maximum update depth exceeded").
  if (!projet) return projetsLoaded ? <Navigate to="/" replace /> : null;

  const evm = calculerEVMProjet(projet); // null pour les projets RUN (non applicable)
  const earnedSchedule = calculerEarnedSchedule(projet);
  const alertesAvancement = detecterAvancementNonAJour(projet);
  // Rôle EFFECTIF sur CE projet (pas le rôle global) : un même profil peut être Collaborateur
  // sur un projet et Chef de Projet sur un autre, donc les onglets visibles doivent suivre le
  // rôle par projet (cf. roleSurProjet dans useAuth.jsx).
  const role = roleSurProjet(projet.id) || 'collaborateur';
  const type = projet.type || 'BUILD';
  const tabs = ALL_TABS.filter((t) => t.roles.includes(role) && t.types.includes(type));

  const tabLink = ({ isActive }) => ({
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 12px', textDecoration: 'none', fontSize: 13, fontWeight: 500,
    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    borderBottom: isActive ? `2px solid ${projet.couleur}` : '2px solid transparent',
    transition: 'color 0.15s',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div ref={headerRef} style={{
        padding: '20px 32px 0', borderBottom: '0.5px solid var(--color-border)',
        position: 'sticky', top: 0, zIndex: 20, background: 'var(--color-bg-primary)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: projet.couleur }} />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>{projet.nom}</h2>
          {projet.statut !== 'actif' && (
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
              {projet.statut === 'en_pause' ? 'En pause' : 'Clôturé'}
            </span>
          )}
        </div>
        <SanteProjetEVM evm={evm} earnedSchedule={earnedSchedule} alertes={alertesAvancement} />
        <nav style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
          {tabs.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={`/projet/${id}/${path}`} style={tabLink}>
              <Icon size={13} />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      {/* Pas de overflow:auto ici : le seul conteneur de scroll doit être `main` (App.jsx),
          sinon les positions sticky des pages enfants (ex. sous-onglets RIAD) se calculent
          par rapport au mauvais conteneur et ne collent jamais où prévu. */}
      <div style={{ flex: 1 }}>
        <Outlet context={{ headerHeight }} />
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useParams, useOutletContext } from 'react-router-dom';
import useAppStore from '../store/useAppStore';
import PageHeader from '../components/layout/PageHeader';
import RiadDashboard from '../components/riad/RiadDashboard';
import RiadModuleTable from '../components/riad/RiadModuleTable';
import { RIAD_TITLES } from '../components/riad/riadFields';

const ONGLETS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'risques', label: RIAD_TITLES.risques },
  { key: 'issues', label: RIAD_TITLES.issues },
  { key: 'actions', label: RIAD_TITLES.actions },
  { key: 'decisions', label: RIAD_TITLES.decisions },
];

export default function ProjetRiad() {
  const { id } = useParams();
  const projet = useAppStore((s) => s.projets.find((p) => p.id === id));
  const { headerHeight } = useOutletContext();
  const [onglet, setOnglet] = useState('dashboard');

  if (!projet) return null;

  return (
    <div style={{ padding: 32 }}>
      <PageHeader title="RIAD" subtitle="Risques · Incidents · Actions · Décisions" />

      <div style={{
        display: 'flex', borderBottom: '0.5px solid rgba(0,0,0,0.1)', marginBottom: 24, gap: 0,
        position: 'sticky', top: headerHeight, zIndex: 15, background: '#fff',
      }}>
        {ONGLETS.map((t) => (
          <button
            key={t.key}
            onClick={() => setOnglet(t.key)}
            style={{
              padding: '10px 18px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 500,
              color: onglet === t.key ? '#1A1A18' : '#5F5E5A',
              borderBottom: onglet === t.key ? '2px solid #1A1A18' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {onglet === 'dashboard'
        ? <RiadDashboard projet={projet} />
        : <RiadModuleTable projet={projet} module={onglet} />}
    </div>
  );
}

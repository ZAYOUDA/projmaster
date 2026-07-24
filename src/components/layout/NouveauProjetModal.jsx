import { useState } from 'react';
import { GitBranch, RefreshCw, Download } from 'lucide-react';
import Modal from '../ui/Modal';
import { telechargerModeleWbsPivot } from '../../utils/wbsPivotTemplate';

const TYPES = [
  {
    key: 'BUILD',
    icon: GitBranch,
    label: 'Build',
    description: 'Projet au forfait — WBS, Gantt, Kanban, Planning, Budget.',
  },
  {
    key: 'RUN',
    icon: RefreshCw,
    label: 'Run',
    description: 'TMA / régie — bons de commande annuels, suivi mensuel.',
  },
];

export default function NouveauProjetModal({ onCreate, onImportPlanning, onClose }) {
  const [type, setType] = useState('BUILD');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    await onCreate(type);
  };

  return (
    <Modal title="Nouveau projet" onClose={onClose} width={480} preventClose={creating}>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#5F5E5A' }}>
        Le type de projet ne pourra plus être modifié après création.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {TYPES.map(({ key, icon: Icon, label, description }) => {
          const active = type === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setType(key)}
              style={{
                textAlign: 'left', padding: 16, borderRadius: 10, cursor: 'pointer',
                border: active ? '2px solid #378ADD' : '1px solid rgba(0,0,0,0.12)',
                background: active ? '#EFF6FF' : '#fff',
              }}
            >
              <Icon size={18} color={active ? '#378ADD' : '#5F5E5A'} />
              <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600, color: '#1A1A18' }}>{label}</div>
              <div style={{ marginTop: 4, fontSize: 12, color: '#5F5E5A' }}>{description}</div>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
        <button
          type="button"
          onClick={onImportPlanning}
          disabled={creating}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 12.5, color: '#378ADD', fontWeight: 500, textDecoration: 'underline',
          }}
        >
          Ou créer depuis un fichier d'import de planning (.xlsx) →
        </button>
        <button
          type="button"
          onClick={() => telechargerModeleWbsPivot()}
          disabled={creating}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontSize: 12, color: '#5F5E5A', fontWeight: 500,
          }}
        >
          <Download size={12} /> Modèle
        </button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
        <button
          type="button"
          onClick={onClose}
          disabled={creating}
          style={{
            padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)',
            background: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none', background: '#1A1A18',
            color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: creating ? 0.6 : 1,
          }}
        >
          {creating ? 'Création…' : 'Créer le projet'}
        </button>
      </div>
    </Modal>
  );
}

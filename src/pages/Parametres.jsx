import { useRef } from 'react';
import useAppStore from '../store/useAppStore';
import PageHeader from '../components/layout/PageHeader';
import { exportData, importData } from '../data/storage';
import { defaultData } from '../data/defaultData';
import { Download, Upload, Trash2 } from 'lucide-react';

export default function Parametres() {
  const { collaborateurs, projets, savedAt, importAll } = useAppStore();
  const fileRef = useRef();

  const handleExport = () => exportData({ collaborateurs, projets });

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await importData(file);
      if (confirm('Cette action remplacera toutes les données actuelles. Continuer ?')) {
        importAll(data);
        alert('Données importées avec succès.');
      }
    } catch (err) {
      alert('Erreur : ' + err.message);
    }
    e.target.value = '';
  };

  const handleReset = () => {
    if (confirm('Remettre toutes les données d\'exemple ? Cette action effacera tout.')) {
      importAll(defaultData);
    }
  };

  return (
    <div style={{ padding: 32, maxWidth: 640 }}>
      <PageHeader title="Paramètres" />

      <section style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Export / Import des données</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#5F5E5A' }}>
          Sauvegardez vos données dans un fichier JSON ou restaurez une sauvegarde précédente.
          {savedAt && <span> Dernière sauvegarde : {new Date(savedAt).toLocaleString('fr-FR')}.</span>}
        </p>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handleExport} style={btnStyle}>
            <Download size={14} /> Exporter JSON
          </button>
          <button onClick={() => fileRef.current.click()} style={btnSecStyle}>
            <Upload size={14} /> Importer JSON
          </button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
        </div>
      </section>

      <section style={{ background: '#fff', border: '0.5px solid rgba(0,0,0,0.12)', borderRadius: 12, padding: 24 }}>
        <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 600 }}>Données d'exemple</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#5F5E5A' }}>
          Réinitialiser avec le jeu de données d'exemple ({collaborateurs.length} collaborateurs, {projets.length} projets actuellement).
        </p>
        <button onClick={handleReset} style={{ ...btnStyle, background: '#FAE0DA', color: '#C0391B', gap: 6 }}>
          <Trash2 size={14} /> Réinitialiser
        </button>
      </section>
    </div>
  );
}

const btnStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 6, border: 'none', background: '#1A1A18', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' };
const btnSecStyle = { ...btnStyle, background: '#fff', color: '#1A1A18', border: '1px solid rgba(0,0,0,0.15)' };
